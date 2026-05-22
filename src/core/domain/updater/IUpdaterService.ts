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

/**
 * Three-state result of a check: a newer update exists, no update is
 * available (the check succeeded but we're already current), or the
 * check failed for some network/parse/server reason and the caller
 * should surface that rather than silently report "up to date".
 */
export type CheckResult =
    | { kind: "update"; update: AvailableUpdate }
    | { kind: "up-to-date" }
    | { kind: "error"; message: string };

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
     * Returns a discriminated result so the UI can distinguish
     * "no update" from "the check itself failed" — the latter shouldn't
     * be reported to the user as "up to date".
     *
     * Still does not throw: the launch-time banner needs to be a fire-
     * and-forget call. UI surfaces (Settings) inspect the result.
     */
    check(): Promise<CheckResult>;

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
