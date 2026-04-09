import {
    joinStoragePath,
    normalizeStoragePath,
} from "@/core/persistence/pathUtils.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Managed app-data paths for cloud publishing state.
 *
 * These records should never leak into editable project contents or export
 * payloads. Keeping the path rules here gives every later bead one place to
 * import instead of re-deriving filenames in UI or transport code.
 */
const GIT_REMOTE_STATE_DIRECTORY = "git-remote";
const PROJECT_INFO_DIRECTORY = "project-info";
const PROJECT_STATUS_DIRECTORY = "project-status";

export const GIT_REMOTE_SESSION_FILENAME = "git-remote-session.json";
const GIT_REMOTE_PENDING_REVOCATION_FILENAME =
    "git-remote-pending-revocation.json";

export function getGitRemoteStateRoot(storageRoots: StorageRoots): string {
    return joinStoragePath(
        storageRoots.appDataRoot,
        GIT_REMOTE_STATE_DIRECTORY,
    );
}

export function getGitRemoteSessionPath(storageRoots: StorageRoots): string {
    return joinStoragePath(
        getGitRemoteStateRoot(storageRoots),
        GIT_REMOTE_SESSION_FILENAME,
    );
}

export function getGitRemotePendingRevocationPath(
    storageRoots: StorageRoots,
): string {
    return joinStoragePath(
        getGitRemoteStateRoot(storageRoots),
        GIT_REMOTE_PENDING_REVOCATION_FILENAME,
    );
}

export function getGitRemoteProjectInfoPath(
    storageRoots: StorageRoots,
    projectPath: string,
): string {
    return joinStoragePath(
        getGitRemoteStateRoot(storageRoots),
        PROJECT_INFO_DIRECTORY,
        `${toProjectStorageKey(projectPath)}.json`,
    );
}

export function getGitRemoteProjectStatusPath(
    storageRoots: StorageRoots,
    projectPath: string,
): string {
    return joinStoragePath(
        getGitRemoteStateRoot(storageRoots),
        PROJECT_STATUS_DIRECTORY,
        `${toProjectStorageKey(projectPath)}.json`,
    );
}

export function toProjectStorageKey(projectPath: string): string {
    return encodeURIComponent(normalizeStoragePath(projectPath));
}
