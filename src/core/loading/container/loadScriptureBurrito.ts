import type { ScriptureBurritoProjectLoader } from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import type { ManagedPathLoadArgs } from "@/core/loading/container/loadResourceContainer.ts";
import { basenameStoragePath } from "@/core/persistence/pathUtils.ts";

/**
 * Container-specific reader for Scripture Burrito-backed managed items.
 *
 * `ItemLoader` uses this after container detection but before type-specific noun
 * construction, keeping Burrito parsing concerns isolated from the broader load
 * orchestration.
 */
export async function loadScriptureBurrito(
  loader: ScriptureBurritoProjectLoader,
  args: ManagedPathLoadArgs,
): Promise<LoadedReferenceItem | null> {
  return loader.openResource({
    fs: args.fs,
    projectRootPath: args.managedPath,
    folderName: basenameStoragePath(args.managedPath) || args.managedPath,
    displayName: args.displayName,
  });
}
