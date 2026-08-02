/**
 * Platform-neutral file-system seam used by import, load, and save flows.
 *
 * Everything above this layer should think in terms of managed storage paths,
 * not browser APIs or Tauri APIs. Web and desktop implementations satisfy this
 * same contract so the rest of the app can talk about "disk" consistently.
 */
export type FileSystemEntryKind = "file" | "directory";

/**
 * Minimal catalog row returned by `list`.
 *
 * Import and load code use this to walk managed storage without committing to
 * any platform-specific directory entry type.
 */
export type FileSystemEntry = {
  name: string;
  path: string;
  kind: FileSystemEntryKind;
};

/**
 * Cross-platform filesystem operations over managed app storage.
 *
 * Import uses these methods while shaping incoming bytes into final on-disk
 * layout. Loaders use them later to reopen that managed layout into typed
 * nouns. UI code should not call these methods directly.
 */
export interface FileSystem {
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  writeText(path: string, content: string): Promise<void>;
  /**
   * Atomically replace `path` with `content`. Documented platform behavior:
   * OPFS commits on writable `close()`; Tauri writes a sibling `.tmp` then
   * renames over the target (POSIX `rename(2)` / Windows NTFS `MoveFileExW`
   * with `MOVEFILE_REPLACE_EXISTING`) for same-directory same-volume renames.
   *
   * Why this exists separately from `writeText`/`move`: crash-recovery
   * backups must never be observed half-written. A reader that catches a torn
   * write should see either the old file or the new one, never a truncated
   * mix. (`bodyMd5` in the dirty-buffer wrapper is the second line of defense:
   * if a platform ever violates atomicity, the mismatch surfaces the file as
   * unreadable rather than silently restoring corruption.)
   *
   * Generic `move()` is NOT atomic on `OpfsFileSystem` (it is copy+delete).
   */
  atomicWriteText(path: string, content: string): Promise<void>;
  /** Atomically replace a binary file with the supplied bytes. */
  atomicWriteBytes(path: string, content: Uint8Array): Promise<void>;
  writeBytes(path: string, content: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<FileSystemEntry[]>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  remove(path: string, opts?: { recursive?: boolean }): Promise<void>;
  move(from: string, to: string): Promise<void>;
  createTempFile(prefix: string, suffix?: string): Promise<string>;
}
