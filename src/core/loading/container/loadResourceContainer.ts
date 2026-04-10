import type { ResourceContainerProjectLoader } from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import { basenameStoragePath } from "@/core/persistence/pathUtils.ts";

export type ManagedPathLoadArgs = {
    fs: FileSystem;
    managedPath: string;
    displayName: string;
};

/**
 * Container-specific reader for Resource Container-backed managed items.
 *
 * This function lives in the loading layer so `ItemLoader` can express its
 * pipeline in terms of container detection and typed-item construction rather
 * than reaching directly into older project-era loader classes.
 */
export async function loadResourceContainer(
    loader: ResourceContainerProjectLoader,
    args: ManagedPathLoadArgs,
): Promise<LoadedReferenceItem | null> {
    return loader.openResource({
        fs: args.fs,
        projectRootPath: args.managedPath,
        folderName: basenameStoragePath(args.managedPath) || args.managedPath,
        displayName: args.displayName,
    });
}
