import {TauriFileHandle} from "@/tauri/io/TauriFileHandle.ts";
import {TauriDirectoryHandle} from "@/tauri/io/TauriDirectoryHandle.ts";

export function createTauriHandle(path: string, isDirectory: boolean) {
    return isDirectory ? new TauriDirectoryHandle(path) : new TauriFileHandle(path);
}