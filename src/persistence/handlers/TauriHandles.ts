// TauriHandles.ts

import {TauriDirectoryHandle} from "@/persistence/handlers/TauriDirectoryHandle.ts";
import {TauriFileHandle} from "@/persistence/handlers/TauriFileHandle.ts";


/* ------------------------------ Factory ------------------------------ */

export function createTauriHandle(path: string, isDirectory: boolean) {
    return isDirectory ? new TauriDirectoryHandle(path) : new TauriFileHandle(path);
}
