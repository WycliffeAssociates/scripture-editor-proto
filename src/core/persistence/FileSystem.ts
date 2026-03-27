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
    writeBytes(path: string, content: Uint8Array): Promise<void>;
    exists(path: string): Promise<boolean>;
    list(path: string): Promise<FileSystemEntry[]>;
    mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
    remove(path: string, opts?: { recursive?: boolean }): Promise<void>;
    move(from: string, to: string): Promise<void>;
    createTempFile(prefix: string, suffix?: string): Promise<string>;
}
