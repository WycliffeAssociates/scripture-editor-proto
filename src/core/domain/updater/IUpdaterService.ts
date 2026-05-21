/**
 * Cross-platform updater seam. Desktop wires this to `@tauri-apps/plugin-updater`
 * + `@tauri-apps/plugin-process`; web passes `undefined` since browser tabs
 * don't auto-update from our pipeline.
 *
 * Keeping the seam in `src/core` (not `src/tauri`) lets the shared React tree
 * type-check without depending on Tauri plugin packages.
 */

export type AvailableUpdate = {
    version: string;
    notes: string;
    date: string | null;
};

export type ReleaseListing = {
    version: string;
    tag: string;
    publishedAt: string | null;
    prerelease: boolean;
};

export type IUpdaterService = {
    /** Current installed version (read from compile-time bake-in, not network). */
    currentVersion(): string;

    /** Current channel ("stable" or "nightly"), surfaced from the build identity. */
    currentChannel(): "stable" | "nightly";

    /**
     * Check the configured updater endpoint for a newer release.
     * Returns null if no update is available or if the check failed.
     * Implementations should swallow network errors (logged, not thrown) —
     * an updater that throws on launch is worse than one that quietly
     * doesn't notify.
     */
    check(): Promise<AvailableUpdate | null>;

    /**
     * Download + install the latest update for this channel, then relaunch.
     * Resolves only on unrecoverable failure; on success the process exits
     * via relaunch.
     */
    installAndRelaunch(): Promise<void>;

    /**
     * List recent releases for the current channel, newest first. Used by the
     * manual version picker in Settings. Empty array on network error.
     */
    listVersions(): Promise<ReleaseListing[]>;

    /**
     * Install a specific version (used for manual downgrade or pinning).
     * Fetches the per-version manifest from the worker and applies it via
     * the same plugin path as `installAndRelaunch`. Throws if the version
     * does not exist or the install fails.
     */
    installVersion(version: string): Promise<void>;
};
