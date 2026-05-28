// DirtyBufferStore.ts
//
// Crash-recovery dirty-buffer persistence. While a chapter is dirty (edited but
// not saved), a background pipeline writes the whole book's current USFM to a
// per-book backup file here. On reopen, the route loader reads these back and
// layers them in as the user's latest working state.
//
// This is NOT autosave-to-disk: the real on-disk project files only change on
// explicit save. These backups live alongside other managed app storage and are
// cleared automatically when their book is saved or reverted.
//
// Storage layout: `${rootDir}/${workspaceKey}/${bookCode}.json`, one JSON
// wrapper per book. The wrapper is plain JSON so a tech can extract a
// translator's unsaved work by hand if recovery ever fails.

import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";

export const DIRTY_BUFFER_SCHEMA_VERSION = 1;

/**
 * What disk held for a book at the moment we last knew it. `present` carries the
 * MD5 of the persisted bytes so recovery can tell "disk moved underneath this
 * backup" (mismatch → force review) from "backup matches disk" (safe restore).
 */
export type DiskBaseline =
    | { kind: "absent" }
    | { kind: "present"; md5: string };

/**
 * On-disk backup wrapper. `bodyMd5` is the checksum of `content` and is the torn
 * -write detector; `diskBaseline` records what disk looked like when the backup
 * was written so recovery can classify it.
 */
export type DirtyBufferFile = {
    schemaVersion: typeof DIRTY_BUFFER_SCHEMA_VERSION;
    diskBaseline: DiskBaseline;
    bodyMd5: string;
    writtenAt: number;
    appVersion: string;
    content: string;
};

export type ReadUnreadableReason =
    | "schema-version"
    | "body-md5-mismatch"
    | "json-parse"
    | "io-error";

/**
 * Result of reading one backup. `unreadable` is recoverable-from at the UI level
 * (the recovery report banner surfaces the path + reason); it is never a thrown
 * exception, because one bad backup must not abort the whole reopen.
 */
export type ReadResult =
    | { kind: "missing" }
    | { kind: "valid"; entry: DirtyBufferFile }
    | {
          kind: "unreadable";
          reason: ReadUnreadableReason;
          message: string;
          path: string;
      };

export type DirtyBufferListEntry = {
    bookCode: string;
    path: string;
    result: ReadResult;
};

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isValidDiskBaseline(value: unknown): value is DiskBaseline {
    if (!isRecord(value)) return false;
    if (value.kind === "absent") return true;
    return value.kind === "present" && typeof value.md5 === "string";
}

/**
 * Reads and writes per-book crash-recovery backups over the shared filesystem
 * seam. Construction is platform-neutral: the OPFS or Tauri `FileSystem` and the
 * shared MD5 service are injected so the same store works on web and desktop.
 *
 * `rootDir` is the managed directory the backups live under (e.g.
 * `${appDataRoot}/dirty-buffers`). Methods take `workspaceKey` so a single store
 * instance can address any project's backups.
 */
export class DirtyBufferStore {
    constructor(
        private readonly fileSystem: FileSystem,
        private readonly md5: IMd5Service,
        private readonly rootDir: string,
    ) {}

    private workspaceDir(workspaceKey: string): string {
        return `${this.rootDir}/${workspaceKey}`;
    }

    private bookPath(workspaceKey: string, bookCode: string): string {
        return `${this.workspaceDir(workspaceKey)}/${bookCode}.json`;
    }

    /** Atomically replace a book's backup. */
    async put(
        workspaceKey: string,
        bookCode: string,
        entry: DirtyBufferFile,
    ): Promise<void> {
        await this.fileSystem.atomicWriteText(
            this.bookPath(workspaceKey, bookCode),
            JSON.stringify(entry),
        );
    }

    /**
     * Remove a book's backup. No-op if it is already gone. Returns whether a
     * file was actually removed, so callers (the pipeline) can log only real
     * deletions rather than every clean-book reconcile.
     */
    async clear(workspaceKey: string, bookCode: string): Promise<boolean> {
        const path = this.bookPath(workspaceKey, bookCode);
        if (await this.fileSystem.exists(path)) {
            await this.fileSystem.remove(path);
            return true;
        }
        return false;
    }

    async read(workspaceKey: string, bookCode: string): Promise<ReadResult> {
        return this.readPath(this.bookPath(workspaceKey, bookCode));
    }

    /**
     * Enumerate every backup for a workspace, each already classified into a
     * `ReadResult`. Used once at reopen by the recovery loader. A workspace with
     * no backup directory yet returns an empty list (the common clean case).
     */
    async list(workspaceKey: string): Promise<DirtyBufferListEntry[]> {
        const dir = this.workspaceDir(workspaceKey);
        if (!(await this.fileSystem.exists(dir))) return [];
        const entries = await this.fileSystem.list(dir);
        const results: DirtyBufferListEntry[] = [];
        for (const entry of entries) {
            if (entry.kind !== "file" || !entry.name.endsWith(".json")) {
                continue;
            }
            const bookCode = entry.name.slice(0, -".json".length);
            results.push({
                bookCode,
                path: entry.path,
                result: await this.readPath(entry.path),
            });
        }
        return results;
    }

    /**
     * Read + validate one backup file. Validation order is deliberate: a torn or
     * malformed file is reported with the most specific reason we can prove, and
     * the body-MD5 check is last so it only runs on otherwise-well-formed JSON.
     */
    private async readPath(path: string): Promise<ReadResult> {
        let raw: string;
        try {
            if (!(await this.fileSystem.exists(path))) {
                return { kind: "missing" };
            }
            raw = await this.fileSystem.readText(path);
        } catch (error) {
            return {
                kind: "unreadable",
                reason: "io-error",
                message: errorMessage(error),
                path,
            };
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            return {
                kind: "unreadable",
                reason: "json-parse",
                message: errorMessage(error),
                path,
            };
        }

        if (
            !isRecord(parsed) ||
            parsed.schemaVersion !== DIRTY_BUFFER_SCHEMA_VERSION ||
            typeof parsed.content !== "string" ||
            typeof parsed.bodyMd5 !== "string" ||
            // diskBaseline is a discriminated union the recovery loader
            // dereferences (`backupBaseline.kind`); a checksum-valid file with a
            // null/garbage baseline must NOT pass and then crash the reopen.
            !isValidDiskBaseline(parsed.diskBaseline)
        ) {
            return {
                kind: "unreadable",
                reason: "schema-version",
                message: `Unsupported or malformed dirty-buffer wrapper (expected schemaVersion ${DIRTY_BUFFER_SCHEMA_VERSION})`,
                path,
            };
        }

        const entry = parsed as DirtyBufferFile;
        const actualMd5 = await this.md5.calculateMd5(entry.content);
        if (actualMd5 !== entry.bodyMd5) {
            return {
                kind: "unreadable",
                reason: "body-md5-mismatch",
                message:
                    "Backup body checksum did not match (possible torn write)",
                path,
            };
        }

        return { kind: "valid", entry };
    }
}
