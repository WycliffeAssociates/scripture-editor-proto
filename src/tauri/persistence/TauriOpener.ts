import { save as tauriSave } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import { zipSync } from "fflate";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { IOpener } from "@/core/persistence/IOpener.ts";
import { basenameStoragePath } from "@/core/persistence/pathUtils.ts";
import { shouldStripPortableProjectPath } from "@/core/persistence/portableProjectSanitization.ts";

/**
 * Desktop adapter for "show this on disk" and "export this tree" actions.
 *
 * By the time the UI reaches this seam it already has a managed storage path for
 * an item or project. This adapter handles the desktop-only work of revealing that
 * path in the native file explorer or writing a zip chosen by the user.
 */
export class TauriOpener implements IOpener {
    constructor(private readonly fileSystem: FileSystem) {}

    public async open(dir: string): Promise<void> {
        // Reveal the directory in the file explorer
        await revealItemInDir(dir);
    }

    public async export(projectPath: string, filename?: string): Promise<void> {
        const rootName = basenameStoragePath(projectPath).replace(/\/+$/g, "");
        const allFiles = await collectFiles(this.fileSystem, projectPath);

        // Build the map expected by fflate.zipSync: path -> Uint8Array
        // Prefix every entry with a leading slash and a root folder name to
        // mimic Gitea-style archives (e.g. "/repo-name/path/to/file").
        const filesMap: Record<string, Uint8Array> = {};
        const rootPrefix = `${rootName}/`;
        filesMap[`/${rootPrefix}`] = new Uint8Array(0);
        for (const { fullPath, data } of allFiles) {
            const entryPath = `/${rootPrefix}${fullPath}`;
            filesMap[entryPath] = data;
        }

        // Create zip as Uint8Array
        const zipData = zipSync(filesMap);

        // Ask user where to save the zip file using Tauri's dialog save function.
        const defaultName = filename || `${rootName || "project"}.zip`;
        const zipPath = await tauriSave({
            defaultPath: defaultName,
            filters: [{ name: "Zip", extensions: ["zip"] }],
        });

        if (zipPath) {
            await writeFile(zipPath, zipData);
        }
    }
}

async function collectFiles(
    fileSystem: FileSystem,
    directoryPath: string,
    relPath = "",
): Promise<{ fullPath: string; data: Uint8Array }[]> {
    /**
     * Walk the managed storage tree recursively so export can package the exact
     * on-disk shape without depending on container format or item type.
     */
    const files: { fullPath: string; data: Uint8Array }[] = [];
    for (const entry of await fileSystem.list(directoryPath)) {
        if (shouldStripPortableProjectPath(entry.name)) {
            continue;
        }

        const fullPath = relPath ? `${relPath}/${entry.name}` : entry.name;
        if (entry.kind === "directory") {
            files.push(
                ...(await collectFiles(fileSystem, entry.path, fullPath)),
            );
            continue;
        }

        files.push({
            fullPath,
            data: await fileSystem.readBytes(entry.path),
        });
    }
    return files;
}
