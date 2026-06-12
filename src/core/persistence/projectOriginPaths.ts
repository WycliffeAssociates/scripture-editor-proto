import { toProjectStorageKey } from "@/core/persistence/gitRemotePaths.ts";
import { joinStoragePath } from "@/core/persistence/pathUtils.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Managed app-data paths for import-provenance records.
 *
 * Like the git-remote state family, these records live in app data and must
 * never leak into editable project contents or export payloads. Kept separate
 * from `git-remote/` because provenance (where a project was imported from) is
 * a different noun from the remote it is currently attached to.
 */
const PROJECT_ORIGIN_DIRECTORY = "project-origin";

export function getProjectOriginStateRoot(storageRoots: StorageRoots): string {
  return joinStoragePath(storageRoots.appDataRoot, PROJECT_ORIGIN_DIRECTORY);
}

export function getProjectOriginPath(
  storageRoots: StorageRoots,
  projectPath: string,
): string {
  return joinStoragePath(
    getProjectOriginStateRoot(storageRoots),
    `${toProjectStorageKey(projectPath)}.json`,
  );
}
