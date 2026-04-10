import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { ResourceContainerProjectLoader } from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import {
    SCRIPTURE_BURRITO_METADATA_FILENAME,
    ScriptureBurritoProjectLoader,
} from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import type { LibraryItem } from "@/core/library/LibraryItem.ts";
import { buildTranslationNotesItem } from "@/core/loading/builders/buildTranslationNotesItem.ts";
import { buildUsfmScriptureItem } from "@/core/loading/builders/buildUsfmScriptureItem.ts";
import {
    loadResourceContainer,
    type ManagedPathLoadArgs,
} from "@/core/loading/container/loadResourceContainer.ts";
import { loadScriptureBurrito } from "@/core/loading/container/loadScriptureBurrito.ts";
import type {
    IItemLoader,
    IItemLoaderArgs,
} from "@/core/loading/IItemLoader.ts";
import { basenameStoragePath } from "@/core/persistence/pathUtils.ts";

/**
 * Canonical load orchestrator.
 *
 * This class represents the load phase of the architecture:
 * - detect container format
 * - parse container metadata via container-specific readers
 * - resolve app-facing type
 * - build the typed noun returned to UI/app code
 */
export class ItemLoader implements IItemLoader {
    private rcLoader: ResourceContainerProjectLoader;
    private sbLoader: ScriptureBurritoProjectLoader;

    constructor(md5Service: IMd5Service) {
        this.rcLoader = new ResourceContainerProjectLoader();
        this.sbLoader = new ScriptureBurritoProjectLoader(md5Service);
    }

    /**
     * Reopen one managed path and return the app-facing typed noun.
     *
     * This is the main "disk -> noun" bridge. Callers should already be past
     * import, meaning the files are in their final managed location and only
     * need interpretation.
     */
    async openItem(args: IItemLoaderArgs): Promise<LibraryItem | null> {
        const detected = await this.detectContainerFormat(args);
        if (!detected) return null;

        const managedArgs: ManagedPathLoadArgs = {
            fs: args.fs,
            managedPath: args.managedPath,
            displayName: args.displayName,
        };

        const project =
            detected === "scripture-burrito"
                ? await this.sbLoader.openProject({
                      fs: args.fs,
                      projectRootPath: args.managedPath,
                      folderName:
                          basenameStoragePath(args.managedPath) ??
                          args.managedPath,
                      displayName: args.displayName,
                  })
                : await this.rcLoader.openProject({
                      fs: args.fs,
                      projectRootPath: args.managedPath,
                      folderName:
                          basenameStoragePath(args.managedPath) ??
                          args.managedPath,
                      displayName: args.displayName,
                  });
        if (project) {
            return buildUsfmScriptureItem({
                project,
                containerFormat: detected,
            });
        }

        const resource =
            detected === "scripture-burrito"
                ? await loadScriptureBurrito(this.sbLoader, managedArgs)
                : await loadResourceContainer(this.rcLoader, managedArgs);
        if (!resource) return null;

        return this.buildTypedNoun(resource as never, detected);
    }

    /**
     * Detect which container format owns a managed path by checking for the
     * canonical metadata filename each format writes at its root.
     */
    private async detectContainerFormat(
        args: IItemLoaderArgs,
    ): Promise<"resource-container" | "scripture-burrito" | null> {
        const metadataPath = `${args.managedPath}/${SCRIPTURE_BURRITO_METADATA_FILENAME}`;
        const manifestPath = `${args.managedPath}/manifest.yaml`;

        if (await args.fs.exists(metadataPath)) {
            return "scripture-burrito";
        }
        if (await args.fs.exists(manifestPath)) {
            return "resource-container";
        }
        return null;
    }

    /**
     * Collapse older resource-kind/container details into the newer app-facing
     * typed noun union.
     */
    private buildTypedNoun(
        resource: {
            descriptor: {
                type: string;
            };
        } & Parameters<typeof buildTranslationNotesItem>[0]["resource"],
        containerFormat: "resource-container" | "scripture-burrito",
    ): LibraryItem {
        if (resource.descriptor.type === "translationNotes") {
            return buildTranslationNotesItem({
                resource,
                containerFormat,
            });
        }
        throw new Error(
            `Managed item could not be built as a typed library noun for type ${resource.descriptor.type}.`,
        );
    }
}
