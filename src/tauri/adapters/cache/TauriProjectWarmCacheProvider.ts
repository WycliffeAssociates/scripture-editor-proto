import type {
    ProjectWarmCacheBlob,
    ProjectWarmCacheProvider,
} from "@/app/domain/cache/ProjectWarmCacheProvider.ts";
import {
    isProjectWarmCacheBlob,
    normalizeProjectPath,
} from "@/app/domain/cache/projectWarmCacheUtils.ts";
import { sha1Hex } from "@/app/domain/cache/SubtleSha1FingerprintService.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";

async function getCacheFileName(projectPath: string): Promise<string> {
    const normalizedPath = normalizeProjectPath(projectPath);
    const hash = await sha1Hex(new TextEncoder().encode(normalizedPath));
    return `${hash}.json`;
}

export class TauriProjectWarmCacheProvider implements ProjectWarmCacheProvider {
    constructor(private readonly directoryProvider: IDirectoryProvider) {}

    private async getWarmCacheDirectory() {
        const cacheDir = await this.directoryProvider.cacheDirectory;
        return cacheDir.getDirectoryHandle("project-warm", { create: true });
    }

    async read(projectPath: string): Promise<ProjectWarmCacheBlob | null> {
        try {
            const warmCacheDir = await this.getWarmCacheDirectory();
            const fileHandle = await warmCacheDir.getFileHandle(
                await getCacheFileName(projectPath),
            );
            const text = await (await fileHandle.getFile()).text();
            const parsed = JSON.parse(text);
            return isProjectWarmCacheBlob(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }

    async write(
        projectPath: string,
        blob: ProjectWarmCacheBlob,
    ): Promise<void> {
        const warmCacheDir = await this.getWarmCacheDirectory();
        const fileHandle = await warmCacheDir.getFileHandle(
            await getCacheFileName(projectPath),
            { create: true },
        );
        const writer = await fileHandle.createWriter();
        await writer.write(JSON.stringify(blob));
        await writer.close();
    }

    async clear(projectPath: string): Promise<void> {
        const warmCacheDir = await this.getWarmCacheDirectory();
        try {
            await warmCacheDir.removeEntry(await getCacheFileName(projectPath));
        } catch {
            // Cache is disposable; nothing to do if the file is already absent.
        }
    }
}
