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
        // directories while preserving the shared root names used by core code.
        const publicRoot = await appDataDir();
        const privateRoot = await appLocalDataDir();

        return new TauriStorageRoots(
            privateRoot,
            await join(publicRoot, "projects"),
            await join(privateRoot, "temp"),
            await join(privateRoot, "cache"),
            await join(privateRoot, "logs"),
            await join(privateRoot, "database"),
        );
    }
}
