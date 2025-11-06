import {
    createFileRoute,
    Link,
    useLoaderData,
    useRouter,
} from "@tanstack/react-router";
import type { Project } from "@/core/persistence/ProjectRepository.ts";
import RepoDownload from "@/app/ui/components/import/RepoDownload.tsx";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {IFileHandle} from "@/core/io/IFileHandle.ts";
import { Route as projectRoute } from "./$project";
import JSZip from "jszip";
import {WacsRepoImporter} from "@/core/domain/project/import/WacsRepoImporter.ts";
import {ProjectDirectoryImporter} from "@/core/domain/project/import/ProjectDirectoryImporter.ts";
import {ProjectFileImporter} from "@/core/domain/project/import/ProjectFileImporter.ts";

export const Route = createFileRoute("/")({
    component: Index,
    pendingComponent: () => <div>Loading...</div>,
    pendingMs: 100,
    loader: async ({ context }) => {
        console.time("total time");
        // start here would prefer to wrap into a single abstraction
        const { directoryProvider } = context;
        return { directoryProvider: directoryProvider };
    },
});

// ls the app data dir and show as projects
function Index() {

    const {directoryProvider } = Route.useLoaderData();

    async function handleDownload2(url: string): Promise<void> {
        const importer = new WacsRepoImporter(directoryProvider);
        await importer.import(url);
    }

    async function handleDownload(url: string) {
        console.log("Download", url);

        const res = await fetch(url);
        const data = await res.arrayBuffer();
        const projectsDir: IDirectoryHandle = await directoryProvider.getAppDataDirectory("scripture-editor/projects");
        const filename = url.split("/").slice(-1)[0];
        let projectName = filename.split(".")[0];

        // Create a unique temporary directory for this extraction
        const tempDirectory = await directoryProvider.tempDirectory;
        const tempExtractionDirName = `${projectName}-extract-${Date.now()}`;
        const tempExtractionDir = await tempDirectory.getDirectoryHandle(tempExtractionDirName, { create: true });

        // Save the downloaded zip data to a temporary file
        const tempZipFileName = `${projectName}.zip`;
        const tempZipFileHandle = await tempExtractionDir.getFileHandle(tempZipFileName, { create: true });
        const tempZipWriter = await tempZipFileHandle.createWriter();
        await tempZipWriter.write(data);
        await tempZipWriter.close();
        console.log(`Downloaded zip saved to ${tempZipFileHandle.path}`);

        const zip = new JSZip();
        // Load zip from the temporary file's content
        const loadedZip = await zip.loadAsync(data);

        // Prepare for the actual project directory in app data
        let currentProjectDir: IDirectoryHandle | null = null; // Will be set after conflict resolution

        // Loop through each file in the ZIP and extract to the temporary extraction directory
        for (const fileName of Object.keys(loadedZip.files)) {
            const file = loadedZip.files[fileName];

            // Skip if it's the root directory of the zip or an empty directory name
            if (fileName.endsWith("/") && fileName.split("/").filter(Boolean).length === 0) continue;

            const entryPathParts = fileName.split("/").filter(Boolean);
            const entryName = entryPathParts.pop(); // The actual file or directory name
            const entryDirPath = entryPathParts.join("/"); // The parent directory path within the zip

            let currentExtractionTargetDir: IDirectoryHandle = tempExtractionDir;

            // Create intermediate directories within the temporary extraction directory
            if (entryDirPath) {
                const intermediateDirs = entryDirPath.split("/");
                let tempSubDir = tempExtractionDir;
                for (const dirPart of intermediateDirs) {
                    tempSubDir = await tempSubDir.getDirectoryHandle(dirPart, { create: true });
                }
                currentExtractionTargetDir = tempSubDir;
            }

            // Handle directories and files
            if (file.dir) {
                if (entryName) {
                    try {
                        await currentExtractionTargetDir.getDirectoryHandle(entryName, { create: true });
                    } catch (error) {
                        console.error(`Error creating temporary directory ${currentExtractionTargetDir.path}/${entryName}:`, error);
                    }
                }
            } else if (entryName) {
                try {
                    const content = await file.async('arraybuffer');
                    const handle = await currentExtractionTargetDir.getFileHandle(entryName, { create: true });
                    const writer = await handle.createWriter();
                    await writer.write(content);
                    await writer.close();
                    console.log("Wrote", handle.path);
                } catch (error) {
                    console.error(`Error writing temporary file ${currentExtractionTargetDir.path}/${entryName}:`, error);
                }
            }
        }
        console.log("Extraction to temporary directory complete.");

        // --- Phase 2: Identify Top-Level Extracted Content and Handle Naming Conflicts ---

        // Find the top-level entry in the extracted temporary directory
        let topLevelEntries = [];
        for await (const [name, handle] of tempExtractionDir.entries()) {
            topLevelEntries.push({ name, handle });
        }

        if (topLevelEntries.length === 0) {
            console.error("No content extracted from zip.");
            await tempDirectory.removeEntry(tempExtractionDirName, { recursive: true });
            return; // No content, nothing to copy
        } else if (topLevelEntries.length > 1) {
            console.warn("Zip contains multiple top-level entries. Copying only the first one found as the project directory.");
        }

        const extractedTopLevelItem = topLevelEntries[0];
        let targetProjectDirName = extractedTopLevelItem.name;
        let counter = 0;
        let uniqueProjectDirName = targetProjectDirName;

        // Resolve naming conflicts
        console.log(uniqueProjectDirName);
        let containsDir = await projectsDir.containsDir(uniqueProjectDirName);
        debugger
        while (containsDir === true) {
            console.log("Directory already exists: " + containsDir);
            counter++;
            uniqueProjectDirName = `${targetProjectDirName} (${counter})`;
            containsDir = await projectsDir.containsDir(uniqueProjectDirName);

        }

        // Create the final project directory in the projectsDir with a unique name
        currentProjectDir = await projectsDir.getDirectoryHandle(uniqueProjectDirName, { create: true });
        console.log(`Final project directory created: ${currentProjectDir.path}`);

        // --- Phase 3: Copy Extracted Content to Final projectsDir Location ---

        // Helper to recursively copy directory contents
        async function copyDirectoryContents(sourceDir: IDirectoryHandle, destinationDir: IDirectoryHandle) {
            for await (const [name, handle] of sourceDir.entries()) {
                if (handle.isDir) {
                    const newDestDir = await destinationDir.getDirectoryHandle(name, { create: true });
                    await copyDirectoryContents(handle as IDirectoryHandle, newDestDir);
                } else if (handle.isFile) {
                    const sourceFileHandle = handle as IFileHandle;
                    const destFileHandle = await destinationDir.getFileHandle(name, { create: true });
                    const content = await sourceFileHandle.getFile().then((f: File) => f.arrayBuffer());
                    const writer = await destFileHandle.createWriter();
                    await writer.write(content);
                    await writer.close();
                }
            }
        }

        // Start copying from the top-level extracted item to the final project directory
        if (extractedTopLevelItem.handle.isDir) {
            await copyDirectoryContents(extractedTopLevelItem.handle as IDirectoryHandle, currentProjectDir);
        } else if (extractedTopLevelItem.handle.isFile) {
            // If the top-level item is a file, copy it directly into the new project directory
            const sourceFileHandle = extractedTopLevelItem.handle as IFileHandle;
            const destFileHandle = await currentProjectDir.getFileHandle(sourceFileHandle.name, { create: true });
            const content = await sourceFileHandle.getFile().then((f: File) => f.arrayBuffer());
            const writer = await destFileHandle.createWriter();
            await writer.write(content);
            await writer.close();
        }
        console.log("Copy to final project directory complete.");

        // --- Phase 4: Cleanup ---
        try {
            await tempDirectory.removeEntry(tempExtractionDirName, { recursive: true });
            await tempDirectory.removeEntry(tempZipFileName, { recursive: true });
            console.log("Temporary files and directories cleaned up.");
        } catch (e) {
            console.error("Error during cleanup of temporary files:", e);
        }

    }

    async function handleOpenDirectory() {
        console.log("Opening directory directory...");
        // Check if the File System Access API is supported
        if ('showDirectoryPicker' in window) {
            try {
                // Show the directory picker and wait for the user to select a directory
                const directoryHandle = await window.showDirectoryPicker({
                    // Optional: specify 'readwrite' mode if you need to modify files/directories
                    mode: 'readwrite'
                });

                console.log('Successfully received a FileSystemDirectoryHandle:');
                console.log(directoryHandle);

                // --- You can now work with the directory handle ---
                // Example: List the contents of the directory
                for await (const entry of directoryHandle.values()) {
                    console.log(`Entry: ${entry.name} (Kind: ${entry.kind})`);
                }

                const importer = new ProjectDirectoryImporter(directoryProvider);
                await importer.importDirectory(directoryHandle);
                return directoryHandle;
            } catch (err) {
                // Handle the case where the user cancels the picker
                if (err.name === 'AbortError') {
                    console.log('Directory selection cancelled by the user.');
                } else {
                    console.error('Error opening directory picker:', err);
                }
            }
        } else {
            // Fallback for browsers that don't support the API
            alert('The File System Access API is not supported in this browser.');
            // You could use a traditional <input type="file" webkitdirectory> as a fallback
        }
    }

    async function handleOpenFile() {
        if ('showOpenFilePicker' in window) {
            try {
                const handles = await window.showOpenFilePicker({
                    multiple: false,

                    // 🚨 Configure the file types here 🚨
                    types: [{
                        description: 'ZIP Archive Files',
                        accept: {
                            'application/zip': ['.zip'] // Specifies the MIME type and file extension
                        }
                    }],

                    mode: 'readwrite'
                });

                const zipFileHandle = handles[0];
                
                const importer = new ProjectFileImporter(directoryProvider);
                await importer.importFile(zipFileHandle);
                console.log('Selected ZIP File Handle:', zipFileHandle);

                // You can now proceed to read or process the ZIP file
                return zipFileHandle;

            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log('File selection cancelled by the user.');
                } else {
                    console.error('Error opening file picker:', err);
                }
            }
        } else {
            alert('The File System Access API is not supported in this browser.');
        }
        return null;
    }

    const { projects } = useLoaderData({ from: "__root__" });
    const { settingsManager } = useRouter().options.context;
    return (
        <div>
            <h1>Projects</h1>
            <ul className="flex flex-col gap-2">
                {projects?.map((project: Project) => (
                    <Link
                        key={project.projectDir.path}
                        to={projectRoute.id}
                        params={{project: project.projectDir.name}}
                        onClick={() => {
                            console.log("Clicked on Project", project.id);
                            settingsManager.update({
                                lastProjectPath: project.projectDir.path,
                            });
                        }}
                    >
                        {project.name}
                    </Link>
                ))}
            </ul>

            <br/>
            <h1>Find a Repo</h1>
            <RepoDownload onDownload={handleDownload2} isDownloadDisabled={false}>
            </RepoDownload>

            <button onClick={handleOpenDirectory}>Open Directory</button>
            <br/>
            <button onClick={handleOpenFile}>Open File</button>
        </div>
    );
}
