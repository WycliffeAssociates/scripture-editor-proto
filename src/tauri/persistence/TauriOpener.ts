import { save as tauriSave } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import { zipSync } from "fflate";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IOpener } from "@/core/persistence/IOpener.ts";

/**
 * Tauri-specific opener implementation.
 *
 * Notes:
 * - All imports are static and located at the top of the file.
 * - Uses `fflate.zipSync` with a Record<string, Uint8Array> map to produce the zip bytes.
 * - Uses Tauri plugin APIs to open directories and save/write the produced zip file.
 */
export class TauriOpener implements IOpener {
    public async open(dir: string): Promise<void> {
        // Reveal the directory in the file explorer
        await revealItemInDir(dir);
    }

    public async export(
        dir: IDirectoryHandle,
        filename?: string,
    ): Promise<void> {
        // Recursively collect files from the provided directory handle.
        async function collectFiles(
            d: IDirectoryHandle,
            relPath = "",
        ): Promise<{ fullPath: string; data: Uint8Array }[]> {
            const files: { fullPath: string; data: Uint8Array }[] = [];
            for await (const [name, entry] of d.entries()) {
                const fullPath = relPath ? `${relPath}/${name}` : name;
                if (entry.isDir) {
                    const subdir = entry.asDirectoryHandle();
                    if (!subdir) {
                        throw new Error("Expected directory handle");
                    }
                    files.push(...(await collectFiles(subdir, fullPath)));
                } else {
                    const fileHandle = entry.asFileHandle();
                    if (!fileHandle) {
                        throw new Error("Expected file handle");
                    }
                    const f = await fileHandle.getFile();
                    const data = new Uint8Array(await f.arrayBuffer());
                    files.push({ fullPath, data });
                }
            }
            return files;
        }

        const allFiles = await collectFiles(dir);

        // Build the map expected by fflate.zipSync: path -> Uint8Array
        // Prefix every entry with a leading slash and a root folder name to
        // mimic Gitea-style archives (e.g. "/repo-name/path/to/file").
        const filesMap: Record<string, Uint8Array> = {};
        const rootName = dir.name.replace(/\/+$/g, "");
        const rootPrefix = `${rootName}/`;
        for (const { fullPath, data } of allFiles) {
            const entryPath = `/${rootPrefix}${fullPath}`;
            filesMap[entryPath] = data;
        }

        // Create zip as Uint8Array
        const zipData = zipSync(filesMap);

        // Ask user where to save the zip file using Tauri's dialog save function.
        const defaultName = filename || `${dir.name || "project"}.zip`;
        const zipPath = await tauriSave({
            defaultPath: defaultName,
            filters: [{ name: "Zip", extensions: ["zip"] }],
        });

        if (zipPath) {
            await writeFile(zipPath, zipData);
        }
    }
}
