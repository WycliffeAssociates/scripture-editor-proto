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
import {
  dirnameStoragePath,
  joinStoragePath,
} from "@/core/persistence/pathUtils.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Shared JSON persistence helpers for cloud publishing state.
 *
 * The storage rules stay small: one canonical path family, one JSON read/write
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
  const path = getGitRemoteProjectInfoPath(args.storageRoots, args.projectPath);
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
    path: getGitRemoteProjectStatusPath(args.storageRoots, args.projectPath),
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

const projectStatusQueues = new Map<string, Promise<unknown>>();

/**
 * Serialize read-modify-write updates for a project's durable cloud status.
 *
 * Open hydration, save publish, explicit sync, and remote-accept can overlap in
 * the UI. Callers that need to merge a lifecycle patch into the current durable
 * record should use this boundary instead of separately reading and writing,
 * otherwise the last writer can clobber heads/timestamps from an earlier writer.
 */
export async function applyGitRemoteProjectStatus(args: {
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  projectPath: string;
  update: (
    existing: GitRemoteProjectStatus | null,
  ) => GitRemoteProjectStatus | Promise<GitRemoteProjectStatus>;
}): Promise<GitRemoteProjectStatus> {
  const projectPath = normalizeGitRemoteProjectPath(args.projectPath);
  const previous = projectStatusQueues.get(projectPath) ?? Promise.resolve();
  const next = previous
    .catch(() => {
      // Preserve queue progress after a failed prior transition.
    })
    .then(async () => {
      const existing = await readGitRemoteProjectStatus({
        fileSystem: args.fileSystem,
        storageRoots: args.storageRoots,
        projectPath,
      });
      const status = await args.update(existing);
      await writeGitRemoteProjectStatus({
        fileSystem: args.fileSystem,
        storageRoots: args.storageRoots,
        status,
      });
      return status;
    });
  projectStatusQueues.set(projectPath, next);
  try {
    return await next;
  } finally {
    if (projectStatusQueues.get(projectPath) === next) {
      projectStatusQueues.delete(projectPath);
    }
  }
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
  await args.fileSystem.writeText(path, JSON.stringify(args.session, null, 2));
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
  await args.fileSystem.writeText(path, JSON.stringify(args.pending, null, 2));
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
  const gitRemoteRoot = joinStoragePath(dirnameStoragePath(path));
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
