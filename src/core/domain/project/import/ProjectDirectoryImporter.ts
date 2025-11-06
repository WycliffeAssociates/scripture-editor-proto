import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {IFileHandle} from "@/core/io/IFileHandle.ts";
import {IDirectoryProvider} from "@/core/persistence/DirectoryProvider.ts";
import {Importer} from "@/core/domain/project/import/Importer.ts";

/**
 * Importer class responsible for importing a project that is already available
 * as a local IDirectoryHandle (i.e., already unzipped or selected from disk).
 * It handles resolving naming conflicts and copying the directory structure
 * to the permanent projects directory.
 *
 * NOTE: This class implements the Importer interface but its primary function
 * uses a dedicated method (importDirectory) to accept the IDirectoryHandle
 * as requested, as the string 'path' in the Importer interface is ambiguous
 * for local directory import.
 */
export class ProjectDirectoryImporter implements Importer {
    private readonly directoryProvider: IDirectoryProvider;
    // Defines the base path where final projects are stored
    private readonly projectsBaseDirName = "scripture-editor/projects";

    constructor(directoryProvider: IDirectoryProvider) {
        this.directoryProvider = directoryProvider;
    }

    /**
     * Placeholder to satisfy the Importer interface.
     * In a real application, this method would need a way to resolve the
     * string path to an IDirectoryHandle, perhaps from a mounted location.
     */
    public async import(path: string): Promise<boolean> {
        console.warn(`[DirectoryProjectImporter] Standard 'import(path: string)' called for path: ${path}.
            Please use 'importDirectory(sourceDir: IDirectoryHandle)' instead for local imports.`);
        // Assuming 'path' could be the name of a directory in the temp folder for recovery/staging
        try {
            const tempDir = await this.directoryProvider.tempDirectory;
            const sourceDir = await tempDir.getDirectoryHandle(path);
            return await this.importDirectory(sourceDir);
        } catch (e) {
            console.error(`[DirectoryProjectImporter] Failed to resolve directory handle for path: ${path}`, e);
            return false;
        }
    }


    /**
     * The primary entry point to import a project from an existing directory handle.
     * @param sourceDir The IDirectoryHandle containing the project structure.
     * @returns A promise that resolves to true if the import was successful, false otherwise.
     */
    public async importDirectory(sourceDir: IDirectoryHandle): Promise<boolean> {
        const projectsDir = await this.directoryProvider.getAppDataDirectory(this.projectsBaseDirName);
        const sourceEntryName = sourceDir.name;

        try {
            // 1. Resolve name conflicts and create the final project directory
            const finalProjectDir = await this.resolveProjectDirectory(sourceEntryName, projectsDir);

            // 2. Copy content from source handle to final destination
            await this.copyContentToFinalDestination(sourceDir, finalProjectDir);

            console.log(`[DirectoryProjectImporter] Project imported successfully to: ${finalProjectDir.path}`);
            return true;

        } catch (error) {
            console.error("[DirectoryProjectImporter] Import failed:", error);
            return false;
        }
    }

    /**
     * Checks for project name conflicts in the permanent projects directory
     * and returns a unique, newly created directory handle. (Copied from WacsRepoImporter)
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
        console.log(`[DirectoryProjectImporter] Final project directory created: ${finalProjectDir.path}`);
        return finalProjectDir;
    }

    /**
     * Orchestrates the final copy operation from the source directory handle
     * to the permanent project directory. (Adapted from WacsRepoImporter)
     * @param sourceEntry The IDirectoryHandle to copy from.
     * @param destinationDir The final, unique project IDirectoryHandle.
     */
    private async copyContentToFinalDestination(sourceEntry: IDirectoryHandle, destinationDir: IDirectoryHandle): Promise<void> {
        console.log("[DirectoryProjectImporter] Starting copy to final destination...");

        // Since the source is a directory, we copy its *contents* directly into the destinationDir
        await this.copyDirectoryContents(sourceEntry, destinationDir);

        console.log("[DirectoryProjectImporter] Copy to final project directory complete.");
    }

    /**
     * Recursively copies contents of a source directory to a destination directory. (Copied from WacsRepoImporter)
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
     * Copies a single file from a source handle into a destination directory. (Copied from WacsRepoImporter)
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
            console.log(`[DirectoryProjectImporter] Wrote file: ${destFileHandle.path}`);
        } catch (error) {
            console.error(`[DirectoryProjectImporter] Error copying file ${sourceFileHandle.name}:`, error);
        }
    }
}

// import {Importer} from "@/core/domain/project/import/Importer.ts";
// import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
// import JSZip from "jszip";
// import {IFileHandle} from "@/core/io/IFileHandle.ts";
// import {IDirectoryProvider} from "@/core/persistence/DirectoryProvider.ts";
// import {IPathHandle} from "@/core/io/IPathHandle.ts";
//
// class ProjectDirectoryImporter implements Importer {
//
//     private directoryProvider: IDirectoryProvider;
//
//     constructor(private directoryProvider: IDirectoryProvider) {
//         this.directoryProvider = directoryProvider;
//     }
//
//     async import(path: string): Promise<boolean> {
//         const data = await this.handleZipDownload(path);
//
//
//     }
//
//     async getUniqueProjectDirectory(
//         tempDirectory: IDirectoryHandle,
//         tempExtractionDir: IDirectoryHandle,
//         tempExtractionDirName: string,
//         projectsDir: IDirectoryHandle,
//     ): Promise<IDirectoryHandle | null> {
//         // --- Phase 2: Identify Top-Level Extracted Content and Handle Naming Conflicts ---
//
//         // Find the top-level entry in the extracted temporary directory
//         let topLevelEntries = [];
//         for await (const [name, handle] of tempExtractionDir.entries()) {
//             topLevelEntries.push({ name, handle });
//         }
//
//         if (topLevelEntries.length === 0) {
//             console.error("No content extracted from zip.");
//             await tempDirectory.removeEntry(tempExtractionDirName, { recursive: true });
//             return null; // No content, nothing to copy
//         } else if (topLevelEntries.length > 1) {
//             console.warn("Zip contains multiple top-level entries. Copying only the first one found as the project directory.");
//         }
//
//         const extractedTopLevelItem = topLevelEntries[0];
//         let targetProjectDirName = extractedTopLevelItem.name;
//         let counter = 0;
//         let uniqueProjectDirName = targetProjectDirName;
//
//         // Resolve naming conflicts
//         console.log(uniqueProjectDirName);
//         let containsDir = await projectsDir.containsDir(uniqueProjectDirName);
//         debugger
//         while (containsDir === true) {
//             console.log("Directory already exists: " + containsDir);
//             counter++;
//             uniqueProjectDirName = `${targetProjectDirName} (${counter})`;
//             containsDir = await projectsDir.containsDir(uniqueProjectDirName);
//
//         }
//
//         // Create the final project directory in the projectsDir with a unique name
//         const currentProjectDir = await projectsDir.getDirectoryHandle(uniqueProjectDirName, { create: true });
//         console.log(`Final project directory created: ${currentProjectDir.path}`);
//         return currentProjectDir
//     }
//
//     async copyProjectFromTemp(
//         extractedTopLevelItem: IPathHandle,
//         currentProjectDir: IDirectoryHandle,
//         tempDirectory: IDirectoryHandle,
//         tempExtractionDirName: string,
//         tempZipFileName: string
//
//     ): Promise<void> {
//         // --- Phase 3: Copy Extracted Content to Final projectsDir Location ---
//
//         // Helper to recursively copy directory contents
//         async function copyDirectoryContents(sourceDir: IDirectoryHandle, destinationDir: IDirectoryHandle) {
//             for await (const [name, handle] of sourceDir.entries()) {
//                 if (handle.isDir) {
//                     const newDestDir = await destinationDir.getDirectoryHandle(name, { create: true });
//                     await copyDirectoryContents(handle as IDirectoryHandle, newDestDir);
//                 } else if (handle.isFile) {
//                     const sourceFileHandle = handle as IFileHandle;
//                     const destFileHandle = await destinationDir.getFileHandle(name, { create: true });
//                     const content = await sourceFileHandle.getFile().then((f: File) => f.arrayBuffer());
//                     const writer = await destFileHandle.createWriter();
//                     await writer.write(content);
//                     await writer.close();
//                 }
//             }
//         }
//
//         // Start copying from the top-level extracted item to the final project directory
//         if (extractedTopLevelItem.isDir) {
//             await copyDirectoryContents(extractedTopLevelItem as IDirectoryHandle, currentProjectDir);
//         } else if (extractedTopLevelItem.isFile) {
//             // If the top-level item is a file, copy it directly into the new project directory
//             const sourceFileHandle = extractedTopLevelItem as IFileHandle;
//             const destFileHandle = await currentProjectDir.getFileHandle(sourceFileHandle.name, { create: true });
//             const content = await sourceFileHandle.getFile().then((f: File) => f.arrayBuffer());
//             const writer = await destFileHandle.createWriter();
//             await writer.write(content);
//             await writer.close();
//         }
//         console.log("Copy to final project directory complete.");
//
//         // --- Phase 4: Cleanup ---
//         try {
//             await tempDirectory.removeEntry(tempExtractionDirName, { recursive: true });
//             await tempDirectory.removeEntry(tempZipFileName, { recursive: true });
//             console.log("Temporary files and directories cleaned up.");
//         } catch (e) {
//             console.error("Error during cleanup of temporary files:", e);
//         }
//     }
//
//     private async handleZipDownload(url: string): Promise<ArrayBuffer> {
//         console.log("Download", url);
//
//         const res = await fetch(url);
//         const data = await res.arrayBuffer();
//         const projectsDir: IDirectoryHandle = await this.directoryProvider.getAppDataDirectory("scripture-editor/projects");
//         const filename = url.split("/").slice(-1)[0];
//         let projectName = filename.split(".")[0];
//
//         // Create a unique temporary directory for this extraction
//         const tempDirectory = await this.directoryProvider.tempDirectory;
//         const tempExtractionDirName = `${projectName}-extract-${Date.now()}`;
//         const tempExtractionDir = await tempDirectory.getDirectoryHandle(tempExtractionDirName, {create: true});
//
//         // Save the downloaded zip data to a temporary file
//         const tempZipFileName = `${projectName}.zip`;
//         const tempZipFileHandle = await tempExtractionDir.getFileHandle(tempZipFileName, {create: true});
//         const tempZipWriter = await tempZipFileHandle.createWriter();
//         await tempZipWriter.write(data);
//         await tempZipWriter.close();
//         console.log(`Downloaded zip saved to ${tempZipFileHandle.path}`);
//
//         return data;
//     }
//
//
//     // Helper to recursively copy directory contents
//     async copyDirectoryContents(sourceDir: IDirectoryHandle, destinationDir: IDirectoryHandle) {
//         for await (const [name, handle] of sourceDir.entries()) {
//             if (handle.isDir) {
//                 const newDestDir = await destinationDir.getDirectoryHandle(name, { create: true });
//                 await this.copyDirectoryContents(handle as IDirectoryHandle, newDestDir);
//             } else if (handle.isFile) {
//                 const sourceFileHandle = handle as IFileHandle;
//                 const destFileHandle = await destinationDir.getFileHandle(name, { create: true });
//                 const content = await sourceFileHandle.getFile().then((f: File) => f.arrayBuffer());
//                 const writer = await destFileHandle.createWriter();
//                 await writer.write(content);
//                 await writer.close();
//             }
//         }
//     }
// }