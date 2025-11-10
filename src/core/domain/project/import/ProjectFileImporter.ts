import {strFromU8, type Unzipped, unzip} from "fflate";
import type {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import type {IFileHandle} from "@/core/io/IFileHandle.ts";
import type {IPathHandle} from "@/core/io/IPathHandle.ts";
import type {IDirectoryProvider} from "@/core/persistence/DirectoryProvider.ts";

// Utility type for the result of the temporary extraction
interface ExtractionResult {
  tempDirHandle: IDirectoryHandle;
  extractedTopLevelItem: IPathHandle;
  topLevelEntryName: string;
}

/**
 * Importer class responsible for importing a project from an already available
 * local ZIP file (IFileHandle), typically one uploaded or staged by the user.
 * It extracts the contents to a temporary location, resolves naming conflicts,
 * copies to the permanent projects directory, and cleans up the temporary files.
 */
export class ProjectFileImporter {
  private readonly directoryProvider: IDirectoryProvider;

  constructor(directoryProvider: IDirectoryProvider) {
    this.directoryProvider = directoryProvider;
  }

  /**
   * The main entry point to import a project from a local file path.
   * It assumes 'path' is the location of the staged ZIP file (e.g., in the temp directory).
   * * @param zipFilePath The path (relative or absolute) to the local ZIP file.
   * @returns A promise that resolves to true if the import was successful, false otherwise.
   */
  public async importFile(zipFileHandle: IFileHandle): Promise<boolean> {
    const projectsDir = await this.directoryProvider.projectsDirectory;
    const tempDirectory = await this.directoryProvider.tempDirectory;

    let tempExtractionDir: IDirectoryHandle | null = null;

    try {
      // 1. Resolve the ZIP file handle and read its data
      const data = await zipFileHandle
        .getFile()
        .then((f: File) => f.arrayBuffer());
      console.log(
        `[ProjectFileImporter] Read ZIP file from handle, content size: ${data.byteLength} bytes`
      );

      // 2. Extract content to a temporary location
      const extractionResult = await this.extractZipToTemp(
        zipFileHandle.name,
        data,
        tempDirectory
      );
      tempExtractionDir = extractionResult.tempDirHandle;

      // 3. Resolve name conflicts and create the final project directory
      const finalProjectDir = await this.resolveProjectDirectory(
        extractionResult.topLevelEntryName,
        projectsDir
      );

      // 4. Copy content from temp to final destination
      await this.copyContentToFinalDestination(
        extractionResult.extractedTopLevelItem,
        finalProjectDir
      );

      console.log(
        `[FileProjectImporter] Project imported successfully to: ${finalProjectDir.path}`
      );
      return true;
    } catch (error) {
      console.error("[FileProjectImporter] Import failed:", error);
      return false;
    } finally {
      // 5. Cleanup temporary resources (extraction directory and the original staged ZIP file)
      // await this.cleanup(tempExtractionDir, zipFileHandle);
    }
  }

  /**
   * Resolves the string path to a file handle, assuming the file is in the temp directory.
   */
  private async getZipFileHandle(
    zipFilePath: string,
    tempDirectory: IDirectoryHandle
  ): Promise<IFileHandle> {
    // Attempt to get the file handle from the temp directory using the path
    try {
      const zipFileHandle = await tempDirectory.getFileHandle(zipFilePath);
      return zipFileHandle as IFileHandle;
    } catch (e) {
      throw new Error(
        `[FileProjectImporter] Could not find ZIP file at path: ${zipFilePath}`
      );
    }
  }

  /**
   * Creates a temporary directory and extracts the ZIP content into it.
   * @param zipFileName The name of the ZIP file (used for naming the top-level entry).
   * @param data The ArrayBuffer of the ZIP file content.
   * @param tempDirectory The base temporary directory handle.
   * @returns The temporary directory handle, the top-level entry handle, and its name.
   */
  private async extractZipToTemp(
    zipFileName: string,
    data: ArrayBuffer,
    tempDirectory: IDirectoryHandle
  ): Promise<ExtractionResult> {
    // Create a unique temporary directory for this extraction
    const tempExtractionDirName = `${
      zipFileName.split(".")[0]
    }-extract-${Date.now()}`;
    const tempExtractionDir = await tempDirectory.getDirectoryHandle(
      tempExtractionDirName,
      {create: true}
    );

    const loadedZip = await new Promise<Unzipped>((resolve, reject) => {
      unzip(new Uint8Array(data), {}, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
    console.log("[FileProjectImporter] ZIP data loaded by JSZip.");

    // Loop through each file in the ZIP and extract to the temporary extraction directory
    for (const fileName of Object.keys(loadedZip)) {
      const file = loadedZip[fileName];

      // Skip empty root folder entry (e.g., zip structure like "project/")
      if (
        fileName.endsWith("/") &&
        fileName.split("/").filter(Boolean).length === 0
      )
        continue;

      const entryPathParts = fileName.split("/").filter(Boolean);
      const entryName = entryPathParts.pop(); // The actual file or directory name
      const entryDirPath = entryPathParts.join("/"); // The parent directory path within the zip

      let currentExtractionTargetDir: IDirectoryHandle = tempExtractionDir;

      // 1. Create intermediate directories within the temporary extraction directory
      if (entryDirPath) {
        const intermediateDirs = entryDirPath.split("/");
        let tempSubDir = tempExtractionDir;
        for (const dirPart of intermediateDirs) {
          tempSubDir = await tempSubDir.getDirectoryHandle(dirPart, {
            create: true,
          });
        }
        currentExtractionTargetDir = tempSubDir;
      }

      // 2. Handle directories and files
      if (fileName.endsWith("/")) {
        if (entryName) {
          await currentExtractionTargetDir.getDirectoryHandle(entryName, {
            create: true,
          });
        }
      } else if (entryName) {
        const content = strFromU8(file);
        const fileHandle = await currentExtractionTargetDir.getFileHandle(
          entryName,
          {
            create: true,
          }
        );
        const writer = await fileHandle.createWriter();
        await writer.write(content);
        await writer.close();
      }
    }
    console.log(
      "[FileProjectImporter] Extraction to temporary directory complete."
    );

    // Find the top-level entry in the extracted temporary directory
    const topLevelEntries = [];
    for await (const [name, handle] of tempExtractionDir.entries()) {
      topLevelEntries.push({name, handle});
    }

    if (topLevelEntries.length === 0) {
      throw new Error("No content extracted from zip.");
    }
    if (topLevelEntries.length > 1) {
      console.warn(
        `[FileProjectImporter] Zip contains multiple top-level entries (${topLevelEntries.length}). Copying only the first one found: ${topLevelEntries[0].name}`
      );
    }

    const extractedTopLevelItem = topLevelEntries[0];

    return {
      tempDirHandle: tempExtractionDir,
      extractedTopLevelItem: extractedTopLevelItem.handle,
      topLevelEntryName: extractedTopLevelItem.name,
    };
  }

  /**
   * Checks for project name conflicts in the permanent projects directory
   * and returns a unique, newly created directory handle.
   * @param initialName The preferred project name.
   * @param projectsDir The permanent base directory for all projects.
   * @returns The unique IDirectoryHandle for the new project.
   */
  private async resolveProjectDirectory(
    initialName: string,
    projectsDir: IDirectoryHandle
  ): Promise<IDirectoryHandle> {
    let counter = 0;
    let uniqueProjectDirName = initialName;

    let containsDir = await projectsDir.containsDir(uniqueProjectDirName);

    while (containsDir === true) {
      counter++;
      uniqueProjectDirName = `${initialName} (${counter})`;
      containsDir = await projectsDir.containsDir(uniqueProjectDirName);
    }

    const finalProjectDir = await projectsDir.getDirectoryHandle(
      uniqueProjectDirName,
      {create: true}
    );
    console.log(
      `[FileProjectImporter] Final project directory created: ${finalProjectDir.path}`
    );
    return finalProjectDir;
  }

  /**
   * Orchestrates the final copy operation from the single top-level extracted item
   * to the permanent project directory.
   * @param sourceEntry The top-level IPathHandle from the temporary extraction.
   * @param destinationDir The final, unique project IDirectoryHandle.
   */
  private async copyContentToFinalDestination(
    sourceEntry: IPathHandle,
    destinationDir: IDirectoryHandle
  ): Promise<void> {
    console.log("[FileProjectImporter] Starting copy to final destination...");

    if (sourceEntry.isDir) {
      // If the top-level item is a directory (standard ZIP), copy its *contents*
      await this.copyDirectoryContents(
        sourceEntry as IDirectoryHandle,
        destinationDir
      );
    } else if (sourceEntry.isFile) {
      // If the top-level item is a single file, copy it directly into the new project directory
      const sourceFileHandle = sourceEntry as IFileHandle;
      await this.copyFile(
        sourceFileHandle,
        destinationDir,
        sourceFileHandle.name
      );
    }
    console.log(
      "[FileProjectImporter] Copy to final project directory complete."
    );
  }

  /**
   * Recursively copies contents of a source directory to a destination directory.
   */
  private async copyDirectoryContents(
    sourceDir: IDirectoryHandle,
    destinationDir: IDirectoryHandle
  ): Promise<void> {
    for await (const [name, handle] of sourceDir.entries()) {
      if (handle.isDir) {
        const newDestDir = await destinationDir.getDirectoryHandle(name, {
          create: true,
        });
        await this.copyDirectoryContents(
          handle as IDirectoryHandle,
          newDestDir
        );
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
  private async copyFile(
    sourceFileHandle: IFileHandle,
    destinationDir: IDirectoryHandle,
    newFileName: string
  ): Promise<void> {
    try {
      const destFileHandle = await destinationDir.getFileHandle(newFileName, {
        create: true,
      });
      // Read the file content
      const content = await sourceFileHandle
        .getFile()
        .then((f: File) => f.arrayBuffer());
      // Write the content to the new location
      const writer = await destFileHandle.createWriter();
      await writer.write(content);
      await writer.close();
      console.log(`[FileProjectImporter] Wrote file: ${destFileHandle.path}`);
    } catch (error) {
      console.error(
        `[FileProjectImporter] Error copying file ${sourceFileHandle.name}:`,
        error
      );
    }
  }

  /**
   * Cleans up the temporary extraction directory and the original staged ZIP file.
   * @param tempExtractionDir The temporary directory handle to remove.
   * @param zipFileHandle The handle to the original staged ZIP file.
   */
  private async cleanup(
    tempExtractionDir: IDirectoryHandle | null,
    zipFileHandle: IFileHandle | null
  ): Promise<void> {
    const tempDirectory = await this.directoryProvider.tempDirectory;

    if (tempExtractionDir) {
      try {
        await tempDirectory.removeEntry(tempExtractionDir.name, {
          recursive: true,
        });
        console.log(
          `[FileProjectImporter] Cleaned up temporary extraction directory: ${tempExtractionDir.name}`
        );
      } catch (e) {
        console.error(
          "[FileProjectImporter] Error during cleanup of temporary extraction directory:",
          e
        );
      }
    }

    if (zipFileHandle) {
      try {
        // Assuming the zip file is in the root of the tempDirectory
        await tempDirectory.removeEntry(zipFileHandle.name, {
          recursive: false,
        });
        console.log(
          `[FileProjectImporter] Cleaned up original staged ZIP file: ${zipFileHandle.name}`
        );
      } catch (e) {
        console.error(
          "[FileProjectImporter] Error during cleanup of original staged ZIP file:",
          e
        );
      }
    }
  }
}
