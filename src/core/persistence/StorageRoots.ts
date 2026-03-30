/**
 * Well-known top-level managed storage locations.
 *
 * Import code writes into these roots, index/reconcile code scans them, and
 * loaders reopen items beneath them. Keeping the roots explicit helps explain
 * where a given pipeline stage is allowed to read or write.
 */
export interface StorageRoots {
    readonly appDataRoot: string;
    readonly projectsRoot: string;
    readonly tempRoot: string;
    readonly cacheRoot: string;
    readonly logsRoot: string;
    readonly databaseRoot: string;
}
