import type { LibraryService } from "@/app/library/LibraryService.ts";
import { toIndexedLibraryItem } from "@/app/library/LibraryService.ts";
import {
    DefaultProjectsService,
    type DefaultProjectsServiceDeps,
} from "@/app/persistence/DefaultProjectsService.ts";
import type { ImportSource } from "@/core/domain/project/import/ProjectImporter.ts";
import type {
    ImportFolderSource,
    ImportOptions,
    ImportResult,
    ImportZipSource,
} from "@/core/library/ImportService.ts";
import type { LibraryItem } from "@/core/library/LibraryItem.ts";

/**
 * Preferred app-level library service implementation.
 *
 * This app seam stays generic: list/open/import managed library items without
 * privileging any specific item type. Type-specific narrowing belongs in
 * `app/scripture` or `app/reference`.
 *
 * In practice this class sits just above the older `DefaultProjectsService`
 * machinery while the rest of the app migrates. That means it translates
 * legacy project/resource catalog facts into the newer typed-item story at the
 * app boundary.
 */
export class DefaultLibraryService
    extends DefaultProjectsService
    implements LibraryService
{
    constructor(deps: DefaultProjectsServiceDeps) {
        super(deps);
    }

    /**
     * List every known managed item through the generic library-row shape used
     * by catalog and picker UIs.
     */
    async listLibraryItems() {
        const items = await this.listReferenceResources();
        return items.map(toIndexedLibraryItem).filter((item) => item !== null);
    }

    /**
     * Derive the current-projects subset from library rows instead of keeping a
     * separate top-level concept in storage.
     */
    async listCurrentProjects() {
        const items = await this.listLibraryItems();
        return items.filter((item) => item.isEditable);
    }

    /**
     * Reopen an indexed path through the canonical load pipeline.
     *
     * The older service can still open legacy resource shapes; this method is
     * where we cross into the newer typed-noun story consumed by app UI.
     */
    async openItem(itemRef: string): Promise<LibraryItem | null> {
        const managedPath = this.resolveProjectPath(itemRef);
        if (!(await this.fileSystem.exists(managedPath))) {
            return null;
        }
        return this.itemLoader.openItem({
            fs: this.fileSystem,
            managedPath,
            displayName: await this.resolveProjectDisplayName(managedPath),
        });
    }

    /**
     * Desktop/native folder import path.
     *
     * This implementation only accepts path-based sources because browser
     * `FileList` handling belongs to the web-specific import service.
     */
    async importFolder(
        source: ImportFolderSource,
        options?: ImportOptions,
    ): Promise<ImportResult> {
        if (source.kind !== "path") {
            throw new Error(
                "DefaultLibraryService only supports native path folder imports.",
            );
        }

        return this.importProject(
            {
                type: "fromPreparedDir",
                directoryPath: source.path,
            },
            options,
        );
    }

    /**
     * Desktop/native archive import path.
     */
    async importZip(
        source: ImportZipSource,
        options?: ImportOptions,
    ): Promise<ImportResult> {
        if (source.kind !== "path") {
            throw new Error(
                "DefaultLibraryService only supports native path zip imports.",
            );
        }

        return this.importProject(
            {
                type: "fromZipFile",
                filePath: source.path,
            },
            options,
        );
    }

    /**
     * Remote archive import simply delegates to the underlying importer, which
     * already knows how to download and materialize the managed path.
     */
    async importRemoteZip(
        source: ImportSource,
        options?: ImportOptions,
    ): Promise<ImportResult> {
        return this.importProject(source, options);
    }
}
