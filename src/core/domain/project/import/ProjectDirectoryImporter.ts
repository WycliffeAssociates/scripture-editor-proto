import type { Importer } from "@/core/domain/project/import/Importer.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";

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

  constructor(directoryProvider: IDirectoryProvider) {
    this.directoryProvider = directoryProvider;
  }

  /**
   * Placeholder to satisfy the Importer interface.
   * In a real application, this method would need a way to resolve the
   * string path to an IDirectoryHandle, perhaps from a mounted location.
   */
  public async import(path: string): Promise<string | null> {
    console.warn(`[DirectoryProjectImporter] Standard 'import(path: string)' called for path: ${path}.
            Please use 'importDirectory(sourceDir: IDirectoryHandle)' instead for local imports.`);
    // Assuming 'path' could be the name of a directory in the temp folder for recovery/staging
    try {
      const tempDir = await this.directoryProvider.tempDirectory;
      const sourceDir = await tempDir.getDirectoryHandle(path);
      return await this.importDirectory(sourceDir);
    } catch (e) {
      console.error(
        `[DirectoryProjectImporter] Failed to resolve directory handle for path: ${path}`,
        e,
      );
      return null;
    }
  }

  /**
   * The primary entry point to import a project from an existing directory handle.
   * @param sourceDir The IDirectoryHandle containing the project structure.
   * @returns A promise that resolves to the path of the imported project directory if successful, null otherwise.
   */
  public async importDirectory(
    sourceDir: IDirectoryHandle,
  ): Promise<string | null> {
    const projectsDir = await this.directoryProvider.projectsDirectory;
    let tempProjectDir: IDirectoryHandle | null = null;

    try {
      // NEW STEP: Create a temporary directory and copy the source content there first
      const tempDir = await this.directoryProvider.tempDirectory;
      const tempProjectDirName = `${sourceDir.name}-import-${Date.now()}`;
      tempProjectDir = await tempDir.getDirectoryHandle(tempProjectDirName, {
        create: true,
      });

      await this.copyDirectoryContents(sourceDir, tempProjectDir);
      console.log(
        `[DirectoryProjectImporter] Copied source to temporary directory: ${tempProjectDir.path}`,
      );

      // Look for the actual project name by examining the directory structure
      let projectName = sourceDir.name; // fallback to source dir name

      // Try to find a project directory inside the temp directory
      for await (const [name, handle] of tempProjectDir.entries()) {
        if (handle.isDir) {
          // Use the first subdirectory name as the project name
          projectName = name;
          break;
        }
      }

      // 1. Resolve name conflicts and create the final project directory using the discovered project name
      const finalProjectDir = await this.resolveProjectDirectory(
        projectName,
        projectsDir,
      );

      // 2. Copy content from temp to final destination
      await this.copyContentToFinalDestination(tempProjectDir, finalProjectDir);

      console.log(
        `[DirectoryProjectImporter] Project imported successfully to: ${finalProjectDir.path}`,
      );
      return finalProjectDir.path;
    } catch (error) {
      console.error("[DirectoryProjectImporter] Import failed:", error);
      return null;
    } finally {
      // 3. Cleanup temporary resources
      if (tempProjectDir) {
        await this.cleanup(tempProjectDir);
      }
    }
  }

  /**
   * Checks for project name conflicts in the permanent projects directory
   * and returns a unique, newly created directory handle. (Copied from WacsRepoImporter)
   * @param initialName The preferred project name.
   * @param projectsDir The permanent base directory for all projects.
   * @returns The unique IDirectoryHandle for the new project.
   */
  private async resolveProjectDirectory(
    initialName: string,
    projectsDir: IDirectoryHandle,
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
      { create: true },
    );
    console.log(
      `[DirectoryProjectImporter] Final project directory created: ${finalProjectDir.path}`,
    );
    return finalProjectDir;
  }

  /**
   * Orchestrates the final copy operation from the source directory handle
   * to the permanent project directory. (Adapted from WacsRepoImporter)
   * @param sourceEntry The IDirectoryHandle to copy from.
   * @param destinationDir The final, unique project IDirectoryHandle.
   */
  private async copyContentToFinalDestination(
    sourceEntry: IDirectoryHandle,
    destinationDir: IDirectoryHandle,
  ): Promise<void> {
    console.log(
      "[DirectoryProjectImporter] Starting copy to final destination...",
    );

    // Since the source is a directory, we copy its *contents* directly into the destinationDir
    await this.copyDirectoryContents(sourceEntry, destinationDir);

    console.log(
      "[DirectoryProjectImporter] Copy to final project directory complete.",
    );
  }

  /**
   * Recursively copies contents of a source directory to a destination directory. (Copied from WacsRepoImporter)
   */
  private async copyDirectoryContents(
    sourceDir: IDirectoryHandle,
    destinationDir: IDirectoryHandle,
  ): Promise<void> {
    for await (const [name, handle] of sourceDir.entries()) {
      if (handle.isDir) {
        const newDestDir = await destinationDir.getDirectoryHandle(name, {
          create: true,
        });
        await this.copyDirectoryContents(
          handle as IDirectoryHandle,
          newDestDir,
        );
      } else if (handle.isFile) {
        const sourceFileHandle = handle as IFileHandle;
        await this.copyFile(sourceFileHandle, destinationDir, name);
      } else if (handle.isDir === undefined && handle.isFile === undefined) {
        console.warn(
          `[DirectoryProjectImporter] Skipping unknown handle type: ${name} (kind: ${handle.kind})`,
        );
      }
    }
  }

  /**
   * Copies a single file from a source handle into a destination directory. (Copied from WacsRepoImporter)
   * @param sourceFileHandle The file handle to copy.
   * @param destinationDir The directory handle to place the copy into.
   * @param newFileName The name for the new file.
   */
  private async copyFile(
    sourceFileHandle: IFileHandle,
    destinationDir: IDirectoryHandle,
    newFileName: string,
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
      console.log(
        `[DirectoryProjectImporter] Wrote file: ${destFileHandle.path}`,
      );
    } catch (error) {
      console.error(
        `[DirectoryProjectImporter] Error copying file ${sourceFileHandle.name}:`,
        error,
      );
    }
  }

  /**
   * Cleans up the temporary extraction directory.
   * @param tempExtractionDir The temporary directory handle to remove.
   */
  private async cleanup(tempExtractionDir: IDirectoryHandle): Promise<void> {
    try {
      const tempDirectory = await this.directoryProvider.tempDirectory;
      await tempDirectory.removeEntry(tempExtractionDir.name, {
        recursive: true,
      });
      console.log(
        "[DirectoryProjectImporter] Temporary files and directories cleaned up.",
      );
    } catch (e) {
      console.error(
        "[DirectoryProjectImporter] Error during cleanup of temporary files:",
        e,
      );
    }
  }
}
