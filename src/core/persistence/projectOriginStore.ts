import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import {
  dirnameStoragePath,
  joinStoragePath,
} from "@/core/persistence/pathUtils.ts";
import {
  normalizeProjectOriginPath,
  type ProjectOrigin,
  parseProjectOrigin,
} from "@/core/persistence/projectOriginModels.ts";
import { getProjectOriginPath } from "@/core/persistence/projectOriginPaths.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * JSON persistence helpers for import-provenance sidecars.
 *
 * Mirrors the git-remote store: one canonical path family, one read/write
 * shape, no knowledge of transport or UI.
 */
export async function readProjectOrigin(args: {
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  projectPath: string;
}): Promise<ProjectOrigin | null> {
  const path = getProjectOriginPath(args.storageRoots, args.projectPath);
  if (!(await args.fileSystem.exists(path))) {
    return null;
  }
  try {
    return parseProjectOrigin(JSON.parse(await args.fileSystem.readText(path)));
  } catch (error) {
    console.warn(
      `[projectOrigin] Ignoring unreadable origin record at ${path}:`,
      error,
    );
    return null;
  }
}

export async function writeProjectOrigin(args: {
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  origin: ProjectOrigin;
}): Promise<void> {
  const origin: ProjectOrigin = {
    ...args.origin,
    projectPath: normalizeProjectOriginPath(args.origin.projectPath),
  };
  const path = getProjectOriginPath(args.storageRoots, origin.projectPath);
  await args.fileSystem.mkdir(joinStoragePath(dirnameStoragePath(path)), {
    recursive: true,
  });
  await args.fileSystem.writeText(path, JSON.stringify(origin, null, 2));
}

export async function deleteProjectOrigin(args: {
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  projectPath: string;
}): Promise<void> {
  const path = getProjectOriginPath(args.storageRoots, args.projectPath);
  if (!(await args.fileSystem.exists(path))) return;
  await args.fileSystem.remove(path);
}
