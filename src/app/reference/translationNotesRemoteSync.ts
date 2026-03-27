import type { ProjectImporter } from "@/core/domain/project/import/ProjectImporter.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import type { ProjectIndex } from "@/core/library/ProjectIndex.ts";
import { isRemoteSyncCapable } from "@/core/library/ReferenceItemSupport.ts";
import {
    isPackedTranslationNotesReadable,
    packTranslationNotesDirectory,
} from "@/core/library/stores/PackedTranslationNotesRepository.ts";
import type { IItemLoader } from "@/core/loading/IItemLoader.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import { basenameStoragePath } from "@/core/persistence/pathUtils.ts";

export type TranslationNotesRemoteSyncDependencies = {
    fileSystem: FileSystem;
    projectImporter: ProjectImporter;
    reopenResource(args: {
        managedPath: string;
        displayName: string;
    }): Promise<LoadedReferenceItem | null>;
    itemLoader: IItemLoader;
    projectIndex: ProjectIndex;
};

/**
 * TN-specific remote sync affordance attachment.
 *
 * This is application orchestration layered onto a loaded resource after load
 * has identified it as Translation Notes and after import has chosen its managed
 * disk shape.
 */
export function attachTranslationNotesRemoteSync<T extends LoadedReferenceItem>(
    resource: T,
    dependencies: TranslationNotesRemoteSyncDependencies,
): T {
    if (
        !isRemoteSyncCapable(resource) ||
        resource.descriptor.type !== "translationNotes" ||
        !isPackedTranslationNotesReadable(resource)
    ) {
        return resource;
    }

    return {
        ...resource,
        checkForUpdates: async () => ({
            hasUpdates: false,
            remoteRevision: resource.remoteSource.ref,
            checkedAt: new Date().toISOString(),
        }),
        applyUpdates: async () =>
            applyTranslationNotesRemoteUpdate(resource, dependencies),
    };
}

/**
 * Translation Notes updates are replace-and-repack, not incremental document sync.
 * Re-import the upstream source into a temp location, repack it into the canonical
 * managed TN shape, swap it into place, then reopen the refreshed typed item.
 */
async function applyTranslationNotesRemoteUpdate(
    resource: LoadedReferenceItem,
    dependencies: TranslationNotesRemoteSyncDependencies,
): Promise<void> {
    if (!isRemoteSyncCapable(resource)) {
        throw new Error("Resource does not expose remote sync metadata.");
    }

    const importedPath = await dependencies.projectImporter.import({
        type: "fromGitRepo",
        url: resource.remoteSource.identifier,
    });
    const importedDisplayName = basenameStoragePath(importedPath);
    const backupPath = `${resource.managedPath}.update-backup-${Date.now()}`;
    let movedCurrentToBackup = false;

    try {
        let importedResource = await dependencies.reopenResource({
            managedPath: importedPath,
            displayName: importedDisplayName,
        });
        if (!importedResource) {
            throw new Error(
                `Updated resource could not be loaded from ${importedPath}.`,
            );
        }

        if (
            importedResource.descriptor.type === "translationNotes" &&
            !isPackedTranslationNotesReadable(importedResource)
        ) {
            await packTranslationNotesDirectory({
                fs: dependencies.fileSystem,
                resourcePath: importedPath,
                remoteSource: resource.remoteSource,
            });
            importedResource = await dependencies.reopenResource({
                managedPath: importedPath,
                displayName: importedDisplayName,
            });
            if (!importedResource) {
                throw new Error(
                    `Repacked translation notes resource could not be loaded from ${importedPath}.`,
                );
            }
        }

        await dependencies.fileSystem.move(resource.managedPath, backupPath);
        movedCurrentToBackup = true;
        await dependencies.fileSystem.move(importedPath, resource.managedPath);

        const refreshedItem = await dependencies.itemLoader.openItem({
            fs: dependencies.fileSystem,
            managedPath: resource.managedPath,
            displayName: resource.displayName,
        });
        if (!refreshedItem) {
            throw new Error(
                `Updated resource could not be re-opened from ${resource.managedPath}.`,
            );
        }
        await dependencies.projectIndex.indexItem(refreshedItem);
        await dependencies.fileSystem.remove(backupPath, { recursive: true });
    } catch (error) {
        if (movedCurrentToBackup) {
            try {
                if (
                    await dependencies.fileSystem.exists(resource.managedPath)
                ) {
                    await dependencies.fileSystem.remove(resource.managedPath, {
                        recursive: true,
                    });
                }
                await dependencies.fileSystem.move(
                    backupPath,
                    resource.managedPath,
                );
            } catch {
                // best-effort restore
            }
        } else if (await dependencies.fileSystem.exists(importedPath)) {
            try {
                await dependencies.fileSystem.remove(importedPath, {
                    recursive: true,
                });
            } catch {
                // best-effort cleanup
            }
        }
        throw error;
    }
}
