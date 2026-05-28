import { zipSync } from "fflate";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { IOpener } from "@/core/persistence/IOpener.ts";
import {
    basenameStoragePath,
    joinStoragePath,
} from "@/core/persistence/pathUtils.ts";
import { shouldStripPortableProjectPath } from "@/core/persistence/portableProjectSanitization.ts";

/**
 * Browser adapter for "export this managed tree" actions.
 *
 * The web build cannot reveal local folders like desktop can, but it still needs
 * to let the user take the current on-disk project or item shape with them. This
 * adapter walks the managed storage tree, omits git internals, and triggers a zip
 * download from the browser.
 */
export class WebOpener implements IOpener {
    constructor(private readonly fileSystem: FileSystem) {}

    async export(projectPath: string, filename?: string): Promise<void> {
        const allFiles = await collectFiles(this.fileSystem, projectPath);

        // Build a map of path -> Uint8Array expected by fflate.zipSync
        // Prefix every entry with a leading slash and a root folder name to
        // mimic Gitea-style archives (e.g. "/repo-name/path/to/file").
        const filesMap: Record<string, Uint8Array> = {};
        const rootName = basenameStoragePath(projectPath).replace(/\/+$/g, "");
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
        a.download = filename || `${rootName || "project"}.zip`;
        // Some environments require the link be attached to the DOM for click() to work
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

async function collectFiles(
    fileSystem: FileSystem,
    directoryPath: string,
    relPath = "",
): Promise<{ fullPath: string; data: Uint8Array }[]> {
    /**
     * Export should mirror the current managed storage tree regardless of whether
     * the item came from scripture source files or packed translation notes.
     */
    const directoryEntries = await fileSystem.list(directoryPath);
    const results = await Promise.all(
        directoryEntries.map(
            async (
                entry,
            ): Promise<{ fullPath: string; data: Uint8Array }[]> => {
                if (shouldStripPortableProjectPath(entry.name)) {
                    return [];
                }
                const fullPath = relPath
                    ? `${relPath}/${entry.name}`
                    : entry.name;
                if (entry.kind === "directory") {
                    return collectFiles(fileSystem, entry.path, fullPath);
                }

                return [
                    {
                        fullPath,
                        data: await fileSystem.readBytes(
                            joinStoragePath(directoryPath, entry.name),
                        ),
                    },
                ];
            },
        ),
    );
    return results.flat();
}
