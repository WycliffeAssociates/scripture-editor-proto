import {
  importBrowserDirectorySource,
  importBrowserZipSource,
} from "@/core/domain/project/import/browserImportPipeline.ts";
import type { ImportSource } from "@/core/domain/project/import/ProjectImporter.ts";
import type {
  ImportFolderSource,
  ImportProjectOptions,
  ImportService,
  ImportSourceResult,
  ImportZipSource,
} from "@/core/library/ImportService.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";

function getRemoteArchiveName(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean).at(-1) ?? "archive.zip";
  } catch {
    return "archive.zip";
  }
}

/**
 * Web import adapter.
 *
 * The browser cannot hand us arbitrary local paths, so this implementation is
 * the opposite of the desktop one: it accepts `FileList`/`File` input, keeps
 * classification and storage-shaping in JavaScript, and writes the final
 * managed disk layout into OPFS-backed storage.
 */
export class WebImportService implements ImportService {
  constructor(
    private readonly roots: StorageRoots,
    private readonly projectsService: ProjectsService,
    private readonly fileSystem: FileSystem,
  ) {}

  /**
   * Import a browser-selected folder into managed storage.
   */
  async importFolder(
    source: ImportFolderSource,
    options?: ImportProjectOptions,
  ): Promise<ImportSourceResult> {
    if (source.kind === "path") {
      throw new Error(
        "Web import service does not support importing folder paths.",
      );
    }

    return await importBrowserDirectorySource(source, {
      fileSystem: this.fileSystem,
      storageRoots: this.roots,
      projectsService: this.projectsService,
      onProgress: options?.onProgress,
    });
  }

  /**
   * Import a browser-selected zip into managed storage.
   */
  async importZip(
    source: ImportZipSource,
    options?: ImportProjectOptions,
  ): Promise<ImportSourceResult> {
    if (source.kind === "path") {
      throw new Error(
        "Web import service does not support importing zip paths.",
      );
    }

    return await importBrowserZipSource(source, {
      fileSystem: this.fileSystem,
      storageRoots: this.roots,
      projectsService: this.projectsService,
      onProgress: options?.onProgress,
    });
  }

  /**
   * Download a remote archive in the browser, wrap it as a `File`, then reuse
   * the normal browser zip import path.
   */
  async importRemoteZip(
    source: ImportSource,
    options?: ImportProjectOptions,
  ): Promise<ImportSourceResult> {
    if (source.type !== "fromGitRepo") {
      throw new Error(
        `Web remote import only supports remote archive sources, received ${source.type}.`,
      );
    }

    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(
        `Failed to download remote archive: ${response.status} ${response.statusText}`,
      );
    }

    const buffer = await response.arrayBuffer();
    const contentType =
      response.headers.get("content-type") ?? "application/zip";
    const file = new File([buffer], getRemoteArchiveName(source.url), {
      type: contentType,
    });
    return await this.importZip({ kind: "file", file }, options);
  }
}
