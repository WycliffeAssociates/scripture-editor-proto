import { zipSync } from "fflate";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IOpener } from "@/core/persistence/IOpener.ts";

/**
 * Web-specific opener implementation.
 *
 * Notes:
 * - All imports are at the top of the file.
 * - Uses `fflate`'s `zipSync` to create a zip from a map of file path -> Uint8Array.
 */
export class WebOpener implements IOpener {
    // async open(dir: IDirectoryHandle): Promise<void> {
    //   throw new Error(
    //     "Opening directories in file manager is not supported in web/OPFS.",
    //   );
    // }

    async export(dir: IDirectoryHandle, filename?: string): Promise<void> {
        // Recursively collect all files as { fullPath: string, data: Uint8Array }[]
        async function collectFiles(
            d: IDirectoryHandle,
            relPath = "",
        ): Promise<{ fullPath: string; data: Uint8Array }[]> {
            const files: { fullPath: string; data: Uint8Array }[] = [];
            for await (const [name, entry] of d.entries()) {
                if (name === ".git") {
                    continue;
                }
                const fullPath = relPath ? `${relPath}/${name}` : name;
                if (entry.isDir) {
                    const subdir = entry.asDirectoryHandle();
                    if (subdir) {
                        files.push(...(await collectFiles(subdir, fullPath)));
                    }
                } else {
                    const fileHandle = entry.asFileHandle();
                    if (fileHandle) {
                        const f = await fileHandle.getFile();
                        const data = new Uint8Array(await f.arrayBuffer());
                        files.push({ fullPath, data });
                    }
                }
            }
            return files;
        }

        const allFiles = await collectFiles(dir);

        // Build a map of path -> Uint8Array expected by fflate.zipSync
        // Prefix every entry with a leading slash and a root folder name to
        // mimic Gitea-style archives (e.g. "/repo-name/path/to/file").
        const filesMap: Record<string, Uint8Array> = {};
        const rootName = dir.name.replace(/\/+$/g, "");
        const rootPrefix = `${rootName}/`;

        // Include an explicit directory entry for the root folder (trailing slash).
        // Some consumers expect the top-level folder entry to exist.
        filesMap[`/${rootPrefix}`] = new Uint8Array(0);

        for (const { fullPath, data } of allFiles) {
            const entryPath = `/${rootPrefix}${fullPath}`;
            filesMap[entryPath] = data;
        }

        // Create zip as Uint8Array
        const zipData = zipSync(filesMap);
        // Turn into blob and trigger download
        const blob = new Blob([Uint8Array.from(zipData)], {
            type: "application/zip",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || `${dir.name || "project"}.zip`;
        // Some environments require the link be attached to the DOM for click() to work
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
