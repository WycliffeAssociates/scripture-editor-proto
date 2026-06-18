import { type Unzipped, unzip } from "fflate";

import { SCRIPTURE_BURRITO_METADATA_FILENAME } from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import {
  createImportProgressUpdate,
  ImportProgressPhase,
  type ImportProgressReporter,
} from "@/core/library/ImportService.ts";
import type {
  FileSystem,
  FileSystemEntry,
} from "@/core/persistence/FileSystem.ts";
import {
  joinStoragePath,
  stripFileExtension,
} from "@/core/persistence/pathUtils.ts";
import { shouldStripPortableProjectPath } from "@/core/persistence/portableProjectSanitization.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

type ExtractionResult = {
  tempDirPath: string;
  extractedTopLevelItem: FileSystemEntry;
  topLevelEntryName: string;
  extractedFileCount: number;
};

/**
 * Shared archive pipeline used by both local zip imports and downloaded remote
 * archives.
 *
 * This is still import-phase code: it extracts bytes into temporary storage,
 * locates the container root (the directory holding the manifest) regardless of
 * how deeply the archive nests it, and copies that directory into managed app
 * storage. Type-specific reshaping happens later once the item has been
 * classified.
 */
export class ZipImportPipeline {
  // Defining files we treat as a container root, in detectContainerFormat's
  // Scripture-Burrito-first order.
  private static readonly CONTAINER_MARKER_FILENAMES = [
    SCRIPTURE_BURRITO_METADATA_FILENAME,
    "manifest.yaml",
  ];

  // How far below the archive root we'll look for a container marker. Covers
  // loose-at-root (0), a single wrapping folder (1), and one extra nesting
  // level (2) while bounding the scan.
  private static readonly MAX_CONTAINER_SEARCH_DEPTH = 3;

  constructor(
    public readonly fileSystem: FileSystem,
    private readonly roots: StorageRoots,
  ) {}

  async importFromZipData(args: {
    archiveName: string;
    data: Uint8Array;
    stagedZipPath?: string;
    onProgress?: ImportProgressReporter;
  }): Promise<string> {
    let tempExtractionDirPath: string | null = null;

    try {
      const extractionResult = await this.extractZipToTemp({
        archiveName: args.archiveName,
        data: args.data,
        onProgress: args.onProgress,
      });
      tempExtractionDirPath = extractionResult.tempDirPath;

      const finalProjectPath = await this.resolveProjectDirectory(
        extractionResult.topLevelEntryName,
      );

      await args.onProgress?.(
        createImportProgressUpdate(
          ImportProgressPhase.COPY_CONTENT,
          `Copying extracted archive into app storage (0/${extractionResult.extractedFileCount})...`,
          {
            current: 0,
            total: extractionResult.extractedFileCount,
          },
        ),
      );
      await this.copyContentToFinalDestination(
        extractionResult.extractedTopLevelItem,
        finalProjectPath,
        {
          totalFiles: extractionResult.extractedFileCount,
          onProgress: args.onProgress,
        },
      );

      return finalProjectPath;
    } finally {
      // Zip import stages temp data while extraction is in flight. Cleanup
      // happens even on failure so repeated imports do not leak artifacts.
      await this.cleanup(tempExtractionDirPath, args.stagedZipPath ?? null);
    }
  }

  private async extractZipToTemp(args: {
    archiveName: string;
    data: Uint8Array;
    onProgress?: ImportProgressReporter;
  }): Promise<ExtractionResult> {
    const tempExtractionDirPath = joinStoragePath(
      this.roots.tempRoot,
      `${stripFileExtension(args.archiveName)}-extract-${Date.now()}`,
    );
    await this.fileSystem.mkdir(tempExtractionDirPath, { recursive: true });

    const loadedZip = await new Promise<Unzipped>((resolve, reject) => {
      unzip(args.data, {}, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    const zipEntries = Object.keys(loadedZip).filter(
      (fileName) =>
        !shouldStripPortableProjectPath(fileName) &&
        !(
          fileName.endsWith("/") &&
          fileName.split("/").filter(Boolean).length === 0
        ),
    );
    await args.onProgress?.(
      createImportProgressUpdate(
        ImportProgressPhase.EXTRACT_ARCHIVE,
        `Extracting archive contents (0/${zipEntries.length})...`,
        {
          current: 0,
          total: zipEntries.length,
        },
      ),
    );

    let extractedEntries = 0;

    for (const fileName of Object.keys(loadedZip)) {
      if (shouldStripPortableProjectPath(fileName)) {
        continue;
      }

      if (
        fileName.endsWith("/") &&
        fileName.split("/").filter(Boolean).length === 0
      ) {
        continue;
      }

      const entryPathParts = fileName.split("/").filter(Boolean);
      const entryName = entryPathParts.pop();
      if (!entryName) continue;

      const targetPath = joinStoragePath(
        tempExtractionDirPath,
        ...entryPathParts,
        entryName,
      );

      if (fileName.endsWith("/")) {
        await this.fileSystem.mkdir(targetPath, { recursive: true });
        extractedEntries += 1;
        if (
          extractedEntries === zipEntries.length ||
          extractedEntries % 50 === 0
        ) {
          await args.onProgress?.(
            createImportProgressUpdate(
              ImportProgressPhase.EXTRACT_ARCHIVE,
              `Extracting archive contents (${extractedEntries}/${zipEntries.length})...`,
              {
                current: extractedEntries,
                total: zipEntries.length,
              },
            ),
          );
        }
        continue;
      }

      await this.fileSystem.writeBytes(targetPath, loadedZip[fileName]);
      extractedEntries += 1;
      if (
        extractedEntries === zipEntries.length ||
        extractedEntries % 50 === 0
      ) {
        await args.onProgress?.(
          createImportProgressUpdate(
            ImportProgressPhase.EXTRACT_ARCHIVE,
            `Extracting archive contents (${extractedEntries}/${zipEntries.length})...`,
            {
              current: extractedEntries,
              total: zipEntries.length,
            },
          ),
        );
      }
    }

    const topLevelEntries = await this.fileSystem.list(tempExtractionDirPath);
    if (topLevelEntries.length === 0) {
      throw new Error("No content extracted from zip.");
    }

    const containerRoot = await this.findContainerRoot(
      tempExtractionDirPath,
      topLevelEntries,
      stripFileExtension(args.archiveName),
    );
    // No container marker anywhere within the search depth: fall back to the
    // first top-level entry. This preserves how lone-file / unrecognized
    // archives flow on to the resource loaders downstream.
    const selectedTopLevel = containerRoot ?? topLevelEntries[0];

    return {
      tempDirPath: tempExtractionDirPath,
      extractedTopLevelItem: selectedTopLevel,
      topLevelEntryName: selectedTopLevel.name,
      extractedFileCount: await this.countFiles(selectedTopLevel),
    };
  }

  /**
   * Locate the directory that should become the managed project root by
   * finding where a container's defining file lives.
   *
   * Both container formats key their internal paths to the directory that
   * holds the manifest — Scripture Burrito `metadata.json` ingredients and
   * resource-container `manifest.yaml` entries are relative to it — so the
   * only root that keeps those paths resolving is the manifest's own
   * directory. We breadth-first search from the extraction dir so the
   * *shallowest* marker wins: a manifest sitting beside loose files at the
   * archive root (the common "no enclosing folder" zip) takes precedence over
   * one nested deeper, and a stray manifest buried in a sample folder can't
   * hijack the root. The depth cap bounds the scan on pathological archives.
   *
   * Returns `null` when no marker is found within the depth cap; the caller
   * keeps the legacy first-entry fallback for those.
   */
  private async findContainerRoot(
    tempExtractionDirPath: string,
    topLevelEntries: FileSystemEntry[],
    archiveRootName: string,
  ): Promise<FileSystemEntry | null> {
    type Candidate = {
      dirPath: string;
      entry: FileSystemEntry;
      depth: number;
    };
    const queue: Candidate[] = [
      {
        dirPath: tempExtractionDirPath,
        // Loose-files-at-root: the extraction dir itself is the project root.
        // Name it from the archive, since the temp dir only carries a
        // throwaway "<archive>-extract-<ts>" name.
        entry: {
          name: archiveRootName,
          path: tempExtractionDirPath,
          kind: "directory",
        },
        depth: 0,
      },
    ];

    while (queue.length > 0) {
      const candidate = queue.shift();
      if (!candidate) break;
      const { dirPath, entry, depth } = candidate;

      // metadata.json before manifest.yaml mirrors detectContainerFormat's
      // Scripture-Burrito-first precedence when a dir carries both.
      for (const marker of ZipImportPipeline.CONTAINER_MARKER_FILENAMES) {
        if (await this.fileSystem.exists(joinStoragePath(dirPath, marker))) {
          return entry;
        }
      }

      if (depth >= ZipImportPipeline.MAX_CONTAINER_SEARCH_DEPTH) continue;

      const children =
        depth === 0 ? topLevelEntries : await this.fileSystem.list(dirPath);
      for (const child of children) {
        if (child.kind === "directory") {
          queue.push({ dirPath: child.path, entry: child, depth: depth + 1 });
        }
      }
    }

    return null;
  }

  private async resolveProjectDirectory(initialName: string): Promise<string> {
    let counter = 0;
    let uniqueProjectDirName = initialName;
    let candidate = joinStoragePath(
      this.roots.projectsRoot,
      uniqueProjectDirName,
    );

    while (await this.fileSystem.exists(candidate)) {
      counter++;
      uniqueProjectDirName = `${initialName} (${counter})`;
      candidate = joinStoragePath(
        this.roots.projectsRoot,
        uniqueProjectDirName,
      );
    }

    await this.fileSystem.mkdir(candidate, { recursive: true });
    return candidate;
  }

  private async copyContentToFinalDestination(
    sourceEntry: FileSystemEntry,
    destinationDirPath: string,
    progress?: {
      totalFiles: number;
      copiedFiles?: number;
      onProgress?: ImportProgressReporter;
    },
  ): Promise<void> {
    // Once extraction picks the root entry, the remaining copy step should
    // behave the same whether that root is a directory or a single file.
    if (sourceEntry.kind === "directory") {
      await this.copyDirectoryContents(
        sourceEntry.path,
        destinationDirPath,
        progress,
      );
      return;
    }

    await this.fileSystem.writeBytes(
      joinStoragePath(destinationDirPath, sourceEntry.name),
      await this.fileSystem.readBytes(sourceEntry.path),
    );
    if (progress) {
      progress.copiedFiles = (progress.copiedFiles ?? 0) + 1;
      if (
        progress.copiedFiles === progress.totalFiles ||
        progress.copiedFiles % 50 === 0
      ) {
        await progress.onProgress?.(
          createImportProgressUpdate(
            ImportProgressPhase.COPY_CONTENT,
            `Copying extracted archive into app storage (${progress.copiedFiles}/${progress.totalFiles})...`,
            {
              current: progress.copiedFiles,
              total: progress.totalFiles,
            },
          ),
        );
      }
    }
  }

  private async copyDirectoryContents(
    sourceDirPath: string,
    destinationDirPath: string,
    progress?: {
      totalFiles: number;
      copiedFiles?: number;
      onProgress?: ImportProgressReporter;
    },
  ): Promise<void> {
    for (const entry of await this.fileSystem.list(sourceDirPath)) {
      const destinationPath = joinStoragePath(destinationDirPath, entry.name);

      if (entry.kind === "directory") {
        await this.fileSystem.mkdir(destinationPath, {
          recursive: true,
        });
        await this.copyDirectoryContents(entry.path, destinationPath, progress);
        continue;
      }

      await this.fileSystem.writeBytes(
        destinationPath,
        await this.fileSystem.readBytes(entry.path),
      );
      if (progress) {
        progress.copiedFiles = (progress.copiedFiles ?? 0) + 1;
        if (
          progress.copiedFiles === progress.totalFiles ||
          progress.copiedFiles % 50 === 0
        ) {
          await progress.onProgress?.(
            createImportProgressUpdate(
              ImportProgressPhase.COPY_CONTENT,
              `Copying extracted archive into app storage (${progress.copiedFiles}/${progress.totalFiles})...`,
              {
                current: progress.copiedFiles,
                total: progress.totalFiles,
              },
            ),
          );
        }
      }
    }
  }

  private async countFiles(entry: FileSystemEntry): Promise<number> {
    // Progress should reflect leaf-file copies, not directory creation.
    if (entry.kind === "file") {
      return 1;
    }

    let total = 0;
    for (const child of await this.fileSystem.list(entry.path)) {
      total += await this.countFiles(child);
    }
    return total;
  }

  private async cleanup(
    tempExtractionDirPath: string | null,
    stagedZipPath: string | null,
  ): Promise<void> {
    // Best-effort cleanup. Import success should not depend on whether temp
    // deletion succeeds after the final content is already written.
    if (tempExtractionDirPath) {
      try {
        await this.fileSystem.remove(tempExtractionDirPath, {
          recursive: true,
        });
      } catch (error) {
        console.error("Error cleaning up temp extraction dir:", error);
      }
    }

    if (stagedZipPath) {
      try {
        await this.fileSystem.remove(stagedZipPath, {
          recursive: false,
        });
      } catch (error) {
        console.error("Error cleaning up staged zip file:", error);
      }
    }
  }
}
