import {TauriFileHandle} from "@/tauri/persistence/handlers/TauriFileHandle.ts";
import {TauriDirectoryHandle} from "@/tauri/persistence/handlers/TauriDirectoryHandle.ts";

export function createTauriHandle(path: string, isDirectory: boolean) {
    return isDirectory ? new TauriDirectoryHandle(path) : new TauriFileHandle(path);
}