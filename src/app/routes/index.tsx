import {createFileRoute, Link, useLoaderData, useRouter,} from "@tanstack/react-router";
import type {Project} from "@/core/persistence/ProjectRepository.ts";
import RepoDownload from "@/app/ui/components/import/RepoDownload.tsx";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {Route as projectRoute} from "./$project";
import {WacsRepoImporter} from "@/core/domain/project/import/WacsRepoImporter.ts";
import {ProjectDirectoryImporter} from "@/core/domain/project/import/ProjectDirectoryImporter.ts";
import {ProjectFileImporter} from "@/core/domain/project/import/ProjectFileImporter.ts";

export const Route = createFileRoute("/")({
    component: Index,
    pendingComponent: () => <div>Loading...</div>,
    pendingMs: 100,
    loader: async ({context}) => {
        console.time("total time");
        // start here would prefer to wrap into a single abstraction
        const {directoryProvider} = context;
        return {directoryProvider: directoryProvider};
    },
});

declare module "react" {
    interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
        webkitdirectory?: string;
    }
}

// ls the app data dir and show as projects
function Index() {

    const {directoryProvider} = Route.useLoaderData();

    async function handleDownload2(url: string): Promise<void> {
        const importer = new WacsRepoImporter(directoryProvider);
        await importer.import(url);
    }

    async function handleOpenDirectory(event: React.ChangeEvent<HTMLInputElement>) {
        console.log("Opening directory...");
        const files = event.target.files;
        if (!files || files.length === 0) {
            console.log("No directory selected.");
            return;
        }

        const tempDirectory = await directoryProvider.tempDirectory;
        const tempDirName = `dir-import-${Date.now()}`;
        const tempProjectDir = await tempDirectory.getDirectoryHandle(tempDirName, {create: true});

        // Copy selected directory contents to the temporary directory
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const relativePath = file.webkitRelativePath.split('/').slice(1).join('/'); // Get path relative to the selected directory
            const filePathParts = relativePath.split('/');
            const fileName = filePathParts.pop();
            const dirPath = filePathParts.join('/');

            let currentDirHandle: IDirectoryHandle = tempProjectDir;
            if (dirPath) {
                const intermediateDirs = dirPath.split('/');
                for (const dirPart of intermediateDirs) {
                    currentDirHandle = await currentDirHandle.getDirectoryHandle(dirPart, {create: true});
                }
            }

            if (fileName) {
                const fileHandle = await currentDirHandle.getFileHandle(fileName, {create: true});
                const writer = await fileHandle.createWriter();
                await writer.write(await file.arrayBuffer());
                await writer.close();
            }
        }

        const importer = new ProjectDirectoryImporter(directoryProvider);
        await importer.importDirectory(tempProjectDir);
        // Clean up the temporary directory after import
        await tempDirectory.removeEntry(tempDirName, {recursive: true});
    }

    async function handleOpenFile(event: React.ChangeEvent<HTMLInputElement>) {
        console.log("Opening file...");
        const files = event.target.files;
        if (!files || files.length === 0) {
            console.log("No file selected.");
            return;
        }
        const file = files[0];
        console.log(`[handleOpenFile] Selected file name: ${file.name}, size: ${file.size} bytes`);

        const tempDirectory = await directoryProvider.tempDirectory;
        const tempFileName = `${Date.now()}-${file.name}`;
        const tempFileHandle = await tempDirectory.getFileHandle(tempFileName, {create: true});

        const content = await file.arrayBuffer();
        console.log(`[handleOpenFile] Read ArrayBuffer content size: ${content.byteLength} bytes`);

        const writer = await tempFileHandle.createWriter();
        await writer.write(content);
        await writer.close();
        console.log(`[handleOpenFile] Content written to temporary file: ${tempFileHandle.name}`);

        debugger
        const importer = new ProjectFileImporter(directoryProvider);
        await importer.importFile(tempFileHandle);
        console.log('Selected ZIP File Handle:', tempFileHandle);

        // Clean up the temporary file after import
        await tempDirectory.removeEntry(tempFileName, {recursive: false});
    }

    const {projects} = useLoaderData({from: "__root__"});
    const {settingsManager} = useRouter().options.context;
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

            <div>
                <input type="file" id="file-picker" name="fileList" webkitdirectory="true" multiple onChange={handleOpenDirectory}
                />
            </div>

            <div>
                <label htmlFor="file-input">Select File (ZIP): </label>
                <input
                    id="file-input"
                    type="file"
                    accept=".zip"
                    onChange={handleOpenFile}
                />
            </div>
        </div>
    );
}
