import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import {
    type GitRemotePendingRevocation,
    type GitRemoteProjectInfo,
    type GitRemoteProjectStatus,
    type GitRemoteSession,
    normalizeGitRemoteProjectPath,
    parseGitRemotePendingRevocation,
    parseGitRemoteProjectInfo,
    parseGitRemoteProjectStatus,
    parseGitRemoteSession,
} from "@/core/persistence/gitRemoteModels.ts";
import {
    getGitRemotePendingRevocationPath,
    getGitRemoteProjectInfoPath,
    getGitRemoteProjectStatusPath,
    getGitRemoteSessionPath,
    getGitRemoteStateRoot,
} from "@/core/persistence/gitRemotePaths.ts";
import { joinStoragePath } from "@/core/persistence/pathUtils.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Shared JSON persistence helpers for cloud publishing state.
 *
 * Later beads can wrap these primitives with richer services, but this bead
 * keeps the storage rules small: one canonical path family, one JSON read/write
 * shape, and no direct knowledge of transport or UI.
 */
export async function readGitRemoteProjectInfo(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    projectPath: string;
}): Promise<GitRemoteProjectInfo | null> {
    return readJsonRecord({
        fileSystem: args.fileSystem,
        path: getGitRemoteProjectInfoPath(args.storageRoots, args.projectPath),
        parse: parseGitRemoteProjectInfo,
    });
}

export async function writeGitRemoteProjectInfo(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    info: GitRemoteProjectInfo;
}): Promise<void> {
    const info = {
        ...args.info,
        projectPath: normalizeGitRemoteProjectPath(args.info.projectPath),
    };
    await ensureParentDirectory(
        args.fileSystem,
        getGitRemoteProjectInfoPath(args.storageRoots, info.projectPath),
    );
    await args.fileSystem.writeText(
        getGitRemoteProjectInfoPath(args.storageRoots, info.projectPath),
        JSON.stringify(info, null, 2),
    );
}

export async function deleteGitRemoteProjectInfo(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    projectPath: string;
}): Promise<void> {
    const path = getGitRemoteProjectInfoPath(
        args.storageRoots,
        args.projectPath,
    );
    if (!(await args.fileSystem.exists(path))) return;
    await args.fileSystem.remove(path);
}

export async function readGitRemoteProjectStatus(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    projectPath: string;
}): Promise<GitRemoteProjectStatus | null> {
    return readJsonRecord({
        fileSystem: args.fileSystem,
        path: getGitRemoteProjectStatusPath(
            args.storageRoots,
            args.projectPath,
        ),
        parse: parseGitRemoteProjectStatus,
    });
}

export async function writeGitRemoteProjectStatus(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    status: GitRemoteProjectStatus;
}): Promise<void> {
    const status = {
        ...args.status,
        projectPath: normalizeGitRemoteProjectPath(args.status.projectPath),
    };
    await ensureParentDirectory(
        args.fileSystem,
        getGitRemoteProjectStatusPath(args.storageRoots, status.projectPath),
    );
    await args.fileSystem.writeText(
        getGitRemoteProjectStatusPath(args.storageRoots, status.projectPath),
        JSON.stringify(status, null, 2),
    );
}

export async function deleteGitRemoteProjectStatus(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    projectPath: string;
}): Promise<void> {
    const path = getGitRemoteProjectStatusPath(
        args.storageRoots,
        args.projectPath,
    );
    if (!(await args.fileSystem.exists(path))) return;
    await args.fileSystem.remove(path);
}

export async function readGitRemoteSession(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
}): Promise<GitRemoteSession | null> {
    return readJsonRecord({
        fileSystem: args.fileSystem,
        path: getGitRemoteSessionPath(args.storageRoots),
        parse: parseGitRemoteSession,
    });
}

export async function writeGitRemoteSession(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    session: GitRemoteSession;
}): Promise<void> {
    const path = getGitRemoteSessionPath(args.storageRoots);
    await ensureParentDirectory(args.fileSystem, path);
    await args.fileSystem.writeText(
        path,
        JSON.stringify(args.session, null, 2),
    );
}

export async function deleteGitRemoteSession(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
}): Promise<void> {
    const path = getGitRemoteSessionPath(args.storageRoots);
    if (!(await args.fileSystem.exists(path))) return;
    await args.fileSystem.remove(path);
}

export async function readGitRemotePendingRevocation(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
}): Promise<GitRemotePendingRevocation | null> {
    return readJsonRecord({
        fileSystem: args.fileSystem,
        path: getGitRemotePendingRevocationPath(args.storageRoots),
        parse: parseGitRemotePendingRevocation,
    });
}

export async function writeGitRemotePendingRevocation(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    pending: GitRemotePendingRevocation;
}): Promise<void> {
    const path = getGitRemotePendingRevocationPath(args.storageRoots);
    await ensureParentDirectory(args.fileSystem, path);
    await args.fileSystem.writeText(
        path,
        JSON.stringify(args.pending, null, 2),
    );
}

async function readJsonRecord<T>(args: {
    fileSystem: FileSystem;
    path: string;
    parse: (value: unknown) => T;
}): Promise<T | null> {
    if (!(await args.fileSystem.exists(args.path))) {
        return null;
    }
    return args.parse(JSON.parse(await args.fileSystem.readText(args.path)));
}

async function ensureParentDirectory(
    fileSystem: FileSystem,
    path: string,
): Promise<void> {
    const parent = path.split("/").slice(0, -1).join("/") || "/";
    const gitRemoteRoot = joinStoragePath(parent);
    await fileSystem.mkdir(gitRemoteRoot, { recursive: true });
}

export async function ensureGitRemoteStateRoot(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
}): Promise<void> {
    await args.fileSystem.mkdir(getGitRemoteStateRoot(args.storageRoots), {
        recursive: true,
    });
}
