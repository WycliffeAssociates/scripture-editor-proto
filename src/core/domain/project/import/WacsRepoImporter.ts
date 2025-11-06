import {Importer} from "@/core/domain/project/import/Importer.ts";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import JSZip from "jszip";
import {IFileHandle} from "@/core/io/IFileHandle.ts";
import {IDirectoryProvider} from "@/core/persistence/DirectoryProvider.ts";
import {IPathHandle} from "@/core/io/IPathHandle.ts";

// Utility type for the result of the temporary extraction
interface ExtractionResult {
    tempDirHandle: IDirectoryHandle;
    extractedTopLevelItem: IPathHandle;
    topLevelEntryName: string;
}

/**
 * Importer class responsible for downloading a WACS repository (as a ZIP),
 * extracting it to a temporary location, resolving naming conflicts, and
 * finally copying the contents to the application's permanent projects directory.
 */
export class WacsRepoImporter implements Importer {
    private readonly directoryProvider: IDirectoryProvider;
    // Defines the base path where final projects are stored
    private readonly projectsBaseDirName = "scripture-editor/projects";

    constructor(directoryProvider: IDirectoryProvider) {
        this.directoryProvider = directoryProvider;
    }

    /**
     * The main entry point to import a project from a given URL.
     * @param url The URL of the ZIP file to download and import.
     * @returns A promise that resolves to true if the import was successful, false otherwise.
     */
    public async import(url: string): Promise<boolean> {
        debugger
        const projectsDir = await this.directoryProvider.getAppDataDirectory(this.projectsBaseDirName);
        const tempDirectory = await this.directoryProvider.tempDirectory;

        let tempExtractionDir: IDirectoryHandle | null = null;
        let extractedTopLevelItem: IPathHandle | null = null;

        try {
            // 1. Download the ZIP data
            const { data } = await this.downloadData(url);

            // 2. Extract content to a temporary location
            const extractionResult = await this.extractZipToTemp(data, tempDirectory);
            tempExtractionDir = extractionResult.tempDirHandle;
            extractedTopLevelItem = extractionResult.extractedTopLevelItem;

            // 3. Resolve name conflicts and create the final project directory
            const finalProjectDir = await this.resolveProjectDirectory(extractionResult.topLevelEntryName, projectsDir);

            // 4. Copy content from temp to final destination
            await this.copyContentToFinalDestination(extractedTopLevelItem, finalProjectDir);

            console.log(`[WacsRepoImporter] Project imported successfully to: ${finalProjectDir.path}`);
            return true;

        } catch (error) {
            console.error("[WacsRepoImporter] Import failed:", error);
            return false;
        } finally {
            // 5. Cleanup temporary resources
            if (tempExtractionDir) {
                await this.cleanup(tempExtractionDir);
            }
        }
    }

    /**
     * Downloads the ZIP file content from the provided URL.
     * @param url The URL of the ZIP file.
     * @returns The raw ArrayBuffer data and the file name.
     */
    private async downloadData(url: string): Promise<{ data: ArrayBuffer, filename: string }> {
        console.log(`[WacsRepoImporter] Starting download of: ${url}`);
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`Download failed with status: ${res.status} ${res.statusText}`);
        }

        const data = await res.arrayBuffer();
        // Extract the filename from the URL path
        const filename = url.split("/").slice(-1)[0];
        console.log(`[WacsRepoImporter] Download successful. File size: ${data.byteLength} bytes.`);
        return { data, filename };
    }

    /**
     * Creates a temporary directory and extracts the ZIP content into it.
     * @param data The ArrayBuffer of the ZIP file content.
     * @param tempDirectory The base temporary directory handle.
     * @returns The temporary directory handle, the top-level entry handle, and its name.
     */
    private async extractZipToTemp(data: ArrayBuffer, tempDirectory: IDirectoryHandle): Promise<ExtractionResult> {
        const tempExtractionDirName = `extract-${Date.now()}`;
        const tempExtractionDir = await tempDirectory.getDirectoryHandle(tempExtractionDirName, { create: true });

        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(data);
        console.log("[WacsRepoImporter] ZIP data loaded by JSZip.");

        // Store paths of all created entries for easy lookup later
        const extractedEntryPaths: { [key: string]: IPathHandle } = {};

        // Loop through each file in the ZIP and extract to the temporary extraction directory
        for (const fileName of Object.keys(loadedZip.files)) {
            const file = loadedZip.files[fileName];

            // Skip empty root folder entry (e.g., zip structure like "project/")
            if (fileName.endsWith("/") && fileName.split("/").filter(Boolean).length === 0) continue;

            const entryPathParts = fileName.split("/").filter(Boolean);
            const entryName = entryPathParts.pop(); // The actual file or directory name
            const entryDirPath = entryPathParts.join("/"); // The parent directory path within the zip

            let currentExtractionTargetDir: IDirectoryHandle = tempExtractionDir;

            // 1. Create intermediate directories within the temporary extraction directory
            if (entryDirPath) {
                const intermediateDirs = entryDirPath.split("/");
                let tempSubDir = tempExtractionDir;
                for (const dirPart of intermediateDirs) {
                    tempSubDir = await tempSubDir.getDirectoryHandle(dirPart, { create: true });
                }
                currentExtractionTargetDir = tempSubDir;
            }

            // 2. Handle directories and files
            if (file.dir) {
                if (entryName) {
                    const dirHandle = await currentExtractionTargetDir.getDirectoryHandle(entryName, { create: true });
                    extractedEntryPaths[fileName] = dirHandle;
                }
            } else if (entryName) {
                const content = await file.async('arraybuffer');
                const fileHandle = await currentExtractionTargetDir.getFileHandle(entryName, { create: true });
                const writer = await fileHandle.createWriter();
                await writer.write(content);
                await writer.close();
                extractedEntryPaths[fileName] = fileHandle;
            }
        }
        console.log("[WacsRepoImporter] Extraction to temporary directory complete.");

        // Find the top-level entry in the extracted temporary directory
        let topLevelEntries = [];
        for await (const [name, handle] of tempExtractionDir.entries()) {
            topLevelEntries.push({ name, handle });
        }

        if (topLevelEntries.length === 0) {
            throw new Error("No content extracted from zip.");
        }
        if (topLevelEntries.length > 1) {
            console.warn(`[WacsRepoImporter] Zip contains multiple top-level entries (${topLevelEntries.length}). Copying only the first one found: ${topLevelEntries[0].name}`);
        }

        const extractedTopLevelItem = topLevelEntries[0];

        return {
            tempDirHandle: tempExtractionDir,
            extractedTopLevelItem: extractedTopLevelItem.handle,
            topLevelEntryName: extractedTopLevelItem.name
        };
    }

    /**
     * Checks for project name conflicts in the permanent projects directory
     * and returns a unique, newly created directory handle.
     * @param initialName The preferred project name.
     * @param projectsDir The permanent base directory for all projects.
     * @returns The unique IDirectoryHandle for the new project.
     */
    private async resolveProjectDirectory(initialName: string, projectsDir: IDirectoryHandle): Promise<IDirectoryHandle> {
        let counter = 0;
        let uniqueProjectDirName = initialName;

        let containsDir = await projectsDir.containsDir(uniqueProjectDirName);

        while (containsDir === true) {
            counter++;
            uniqueProjectDirName = `${initialName} (${counter})`;
            containsDir = await projectsDir.containsDir(uniqueProjectDirName);
        }

        const finalProjectDir = await projectsDir.getDirectoryHandle(uniqueProjectDirName, { create: true });
        return finalProjectDir;
    }

    /**
     * Orchestrates the final copy operation from the single top-level extracted item
     * to the permanent project directory.
     * @param sourceEntry The top-level IPathHandle from the temporary extraction.
     * @param destinationDir The final, unique project IDirectoryHandle.
     */
    private async copyContentToFinalDestination(sourceEntry: IPathHandle, destinationDir: IDirectoryHandle): Promise<void> {
        console.log("[WacsRepoImporter] Starting copy to final destination...");

        if (sourceEntry.isDir) {
            // If the top-level item is a directory (standard ZIP), copy its *contents*
            await this.copyDirectoryContents(sourceEntry as IDirectoryHandle, destinationDir);
        } else if (sourceEntry.isFile) {
            // If the top-level item is a single file, copy it directly into the new project directory
            const sourceFileHandle = sourceEntry as IFileHandle;
            await this.copyFile(sourceFileHandle, destinationDir, sourceFileHandle.name);
        }
        console.log("[WacsRepoImporter] Copy to final project directory complete.");
    }

    /**
     * Recursively copies contents of a source directory to a destination directory.
     */
    private async copyDirectoryContents(sourceDir: IDirectoryHandle, destinationDir: IDirectoryHandle): Promise<void> {
        for await (const [name, handle] of sourceDir.entries()) {
            if (handle.isDir) {
                const newDestDir = await destinationDir.getDirectoryHandle(name, { create: true });
                await this.copyDirectoryContents(handle as IDirectoryHandle, newDestDir);
            } else if (handle.isFile) {
                const sourceFileHandle = handle as IFileHandle;
                await this.copyFile(sourceFileHandle, destinationDir, name);
            }
        }
    }

    /**
     * Copies a single file from a source handle into a destination directory.
     * @param sourceFileHandle The file handle to copy.
     * @param destinationDir The directory handle to place the copy into.
     * @param newFileName The name for the new file.
     */
    private async copyFile(sourceFileHandle: IFileHandle, destinationDir: IDirectoryHandle, newFileName: string): Promise<void> {
        try {
            const destFileHandle = await destinationDir.getFileHandle(newFileName, { create: true });
            // Read the file content
            const content = await sourceFileHandle.getFile().then((f: File) => f.arrayBuffer());
            // Write the content to the new location
            const writer = await destFileHandle.createWriter();
            await writer.write(content);
            await writer.close();
            console.log(`[WacsRepoImporter] Wrote file: ${destFileHandle.path}`);
        } catch (error) {
            console.error(`[WacsRepoImporter] Error copying file ${sourceFileHandle.name}:`, error);
        }
    }

    /**
     * Cleans up the temporary extraction directory.
     * @param tempExtractionDir The temporary directory handle to remove.
     */
    private async cleanup(tempExtractionDir: IDirectoryHandle): Promise<void> {
        try {
            // We only need to remove the top-level temporary directory recursively.
            // The directoryProvider ensures this directory is inside the temp base path.
            const tempDirectory = await this.directoryProvider.tempDirectory;
            await tempDirectory.removeEntry(tempExtractionDir.name, { recursive: true });
            console.log("[WacsRepoImporter] Temporary files and directories cleaned up.");
        } catch (e) {
            // Log error but continue, as cleanup should not fail the main import process
            console.error("[WacsRepoImporter] Error during cleanup of temporary files:", e);
        }
    }
}