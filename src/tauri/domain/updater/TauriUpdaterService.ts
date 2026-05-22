import { getIdentifier, getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import type {
    CheckResult,
    IUpdaterService,
    ReleaseListing,
} from "@/core/domain/updater/IUpdaterService.ts";

/**
 * Desktop updater backed by `@tauri-apps/plugin-updater`. The plugin handles
 * endpoint resolution, signature verification (minisign), and atomic install.
 *
 * For the latest-update flow we let the plugin use its configured endpoint
 * (from `tauri.conf.json` plus the Nightly overlay). For the manual version
 * picker we hit the worker directly — Tauri's plugin doesn't expose a list-
 * versions API — and pass the resolved manifest URL back into `check` via the
 * `endpoints` override so signature verification still runs.
 *
 * `VITE_UPDATER_HOST` is baked at build time; release.yml sets it per channel.
 * If unset (local dev), the version picker shows an empty list rather than
 * crashing.
 */

const updaterHost =
    (import.meta.env.VITE_UPDATER_HOST as string | undefined) ?? "";

/**
 * Resolve the updater target string used by both the auto-check (handled by
 * the Tauri plugin) and the manual-switch URL we construct ourselves.
 *
 * The Tauri updater plugin uses bare-OS targets (`darwin`, `linux`,
 * `windows`) when substituting `{{target}}` in the configured endpoint URL.
 * We mirror that here so the worker's asset-lookup logic gets a consistent
 * target shape across both paths. `@tauri-apps/plugin-os`'s `platform()`
 * returns "macos" for darwin, so we map it.
 *
 * `arch()` is intentionally unused: the macOS binary is a universal build,
 * and Linux/Windows we currently only ship x86_64, so a bare-OS target is
 * unambiguous.
 */
function resolveUpdaterTarget(): string {
    const p = platform();
    return p === "macos" ? "darwin" : p;
}

export class TauriUpdaterService implements IUpdaterService {
    private cachedVersion: string | null = null;
    private cachedChannel: "stable" | "nightly" | null = null;

    currentVersion(): string {
        return this.cachedVersion ?? "0.0.0";
    }

    currentChannel(): "stable" | "nightly" {
        return this.cachedChannel ?? "stable";
    }

    /**
     * Prime the cached identity. Called once during bootstrap so the synchronous
     * `currentVersion`/`currentChannel` getters can be consumed by React without
     * suspense.
     */
    async initialize(): Promise<void> {
        const [version, identifier] = await Promise.all([
            getVersion(),
            getIdentifier(),
        ]);
        this.cachedVersion = version;
        this.cachedChannel = identifier.endsWith(".nightly")
            ? "nightly"
            : "stable";
    }

    async check(): Promise<CheckResult> {
        try {
            const update = await check();
            if (!update) return { kind: "up-to-date" };
            return {
                kind: "update",
                update: {
                    version: update.version,
                    notes: update.body ?? "",
                    date: update.date ?? null,
                },
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            console.warn("[updater] check failed", error);
            return { kind: "error", message };
        }
    }

    async installAndRelaunch(): Promise<void> {
        const update: Update | null = await check();
        if (!update) {
            console.warn("[updater] no update available at install time");
            return;
        }
        await update.downloadAndInstall();
        await relaunch();
    }

    async listVersions(): Promise<ReleaseListing[]> {
        if (!updaterHost) return [];
        try {
            const response = await fetch(`${updaterHost}/versions`);
            if (!response.ok) return [];
            const raw = (await response.json()) as Array<{
                version: string;
                tag: string;
                published_at: string;
                prerelease: boolean;
            }>;
            return raw.map((r) => ({
                version: r.version,
                tag: r.tag,
                publishedAt: r.published_at ?? null,
                prerelease: r.prerelease,
            }));
        } catch (error) {
            console.warn("[updater] listVersions failed", error);
            return [];
        }
    }

    async installVersion(version: string): Promise<void> {
        if (!updaterHost) {
            throw new Error("updater host not configured for this build");
        }
        const target = resolveUpdaterTarget();
        const manifestUrl = `${updaterHost}/${target}/at/${version}`;
        // The JS plugin's CheckOptions does not expose endpoint override, so
        // we route the specific-version install through a Rust command that
        // builds an `UpdaterBuilder` with the custom endpoint. The Rust side
        // performs the same signature verification + atomic install as the
        // regular auto-check path.
        await invoke("install_update_from_endpoint", { endpoint: manifestUrl });
        await relaunch();
    }
}
