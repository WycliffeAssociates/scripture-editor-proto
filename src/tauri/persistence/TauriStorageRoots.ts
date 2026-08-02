import { appDataDir, appLocalDataDir, join } from "@tauri-apps/api/path";

import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Desktop storage-root layout.
 *
 * These roots are the concrete locations behind the shared managed-storage
 * contract. Core code stays path-based and platform-neutral; this class decides
 * where those roots live on an actual Tauri install.
 */
export class TauriStorageRoots implements StorageRoots {
  private constructor(
    readonly appDataRoot: string,
    readonly projectsRoot: string,
    readonly tempRoot: string,
    readonly cacheRoot: string,
    readonly logsRoot: string,
    readonly databaseRoot: string,
  ) {}

  static async create(): Promise<TauriStorageRoots> {
    // Keep user-visible project data separate from app-private temp/cache/db
    // directories. The shared findings cache is intentionally under appData so
    // it follows the workspace cache location across desktop and web.
    const [publicRoot, privateRoot] = await Promise.all([
      appDataDir(),
      appLocalDataDir(),
    ]);
    const [projectsRoot, tempRoot, cacheRoot, logsRoot, databaseRoot] =
      await Promise.all([
        join(publicRoot, "projects"),
        join(privateRoot, "temp"),
        join(publicRoot, "cache"),
        join(privateRoot, "logs"),
        join(privateRoot, "database"),
      ]);

    return new TauriStorageRoots(
      privateRoot,
      projectsRoot,
      tempRoot,
      cacheRoot,
      logsRoot,
      databaseRoot,
    );
  }
}
