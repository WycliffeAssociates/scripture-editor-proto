import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import {
    buildProjectWarmCacheBlob,
    cachedEntriesToParsedFiles,
    parseBookTextToCachedFileSection,
} from "@/app/domain/api/loadedProjectToParsedFiles.ts";
import type { ProjectFingerprintService } from "@/app/domain/cache/ProjectFingerprintService.ts";
import type {
    CachedFileSection,
    ProjectWarmCacheProvider,
} from "@/app/domain/cache/ProjectWarmCacheProvider.ts";
import {
    isProjectWarmCacheBlob,
    projectRelativePath,
} from "@/app/domain/cache/projectWarmCacheUtils.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

type WarmLoadedProjectResult = {
    parsedFiles: ParsedFile[];
    allInitialLintErrors: LintError[];
};

type LoadedProjectEntry = Project["files"][number] & {
    relativePath: string;
};

function getLoadedProjectEntries(loadedProject: Project): LoadedProjectEntry[] {
    return loadedProject.files.map((file) => ({
        ...file,
        relativePath: projectRelativePath(
            loadedProject.projectDir.path,
            file.path,
        ),
    }));
}

async function withTimer<T>(label: string, run: () => Promise<T>): Promise<T> {
    console.time(label);
    try {
        return await run();
    } finally {
        console.timeEnd(label);
    }
}

async function readProjectFileBytes(
    loadedProject: Project,
    relativePath: string,
): Promise<Uint8Array> {
    const rootDir = loadedProject.projectDir.asDirectoryHandle();
    if (!rootDir) {
        throw new Error("Project directory is not readable.");
    }
    const fileHandle = await rootDir.getFileHandle(relativePath);
    const file = await fileHandle.getFile();
    return new Uint8Array(await file.arrayBuffer());
}

async function buildFileSectionFromDisk(args: {
    loadedProject: Project;
    entry: LoadedProjectEntry;
    projectFingerprintService: ProjectFingerprintService;
    bytes?: Uint8Array;
}): Promise<CachedFileSection> {
    const bytes =
        args.bytes ??
        (await readProjectFileBytes(
            args.loadedProject,
            args.entry.relativePath,
        ));
    const checksumSha1 = await args.projectFingerprintService.sha1(bytes);
    const text = new TextDecoder().decode(bytes);
    return parseBookTextToCachedFileSection({
        relativePath: args.entry.relativePath,
        checksumSha1,
        bookCode: args.entry.bookCode,
        title: args.entry.title,
        sort: args.entry.sort,
        text,
        languageDirection: args.loadedProject.metadata.language.direction,
    });
}

export async function loadProjectWithWarmCache(args: {
    loadedProject: Project;
    editorMode: EditorModeSetting;
    projectWarmCacheProvider: ProjectWarmCacheProvider;
    projectFingerprintService: ProjectFingerprintService;
}): Promise<WarmLoadedProjectResult> {
    let cachedBlob: Awaited<ReturnType<ProjectWarmCacheProvider["read"]>> =
        null;
    try {
        cachedBlob = await withTimer("warmCache.read", () =>
            args.projectWarmCacheProvider.read(
                args.loadedProject.projectDir.path,
            ),
        );
    } catch (error) {
        console.warn("warm cache read failed", error);
        cachedBlob = null;
    }

    try {
        const currentEntries = getLoadedProjectEntries(args.loadedProject);
        const isCacheUsable =
            cachedBlob &&
            isProjectWarmCacheBlob(cachedBlob) &&
            cachedBlob.projectPath === args.loadedProject.projectDir.path &&
            cachedBlob.projectId === args.loadedProject.metadata.id;
        const cachedSectionsByPath = new Map(
            (isCacheUsable && cachedBlob ? cachedBlob.files : []).map(
                (section) => [section.relativePath, section],
            ),
        );

        let hadMiss =
            !isCacheUsable ||
            cachedSectionsByPath.size !== currentEntries.length;
        const hydratedEntries = await withTimer("warmCache.validate", () =>
            Promise.all(
                currentEntries.map(async (entry) => {
                    const bytes = await readProjectFileBytes(
                        args.loadedProject,
                        entry.relativePath,
                    );
                    const checksumSha1 =
                        await args.projectFingerprintService.sha1(bytes);
                    const cachedSection = cachedSectionsByPath.get(
                        entry.relativePath,
                    );
                    if (
                        cachedSection &&
                        cachedSection.checksumSha1 === checksumSha1
                    ) {
                        return {
                            ...entry,
                            cacheSection: cachedSection,
                            fromCache: true,
                        };
                    }
                    hadMiss = true;
                    return {
                        ...entry,
                        cacheSection: await buildFileSectionFromDisk({
                            loadedProject: args.loadedProject,
                            entry,
                            projectFingerprintService:
                                args.projectFingerprintService,
                            bytes,
                        }),
                        fromCache: false,
                    };
                }),
            ),
        );

        const parsed = await withTimer("warmCache.hydrate", async () =>
            cachedEntriesToParsedFiles({
                entries: hydratedEntries.map((entry) => ({
                    bookCode: entry.bookCode,
                    title: entry.title,
                    path: entry.path,
                    sort: entry.sort,
                    cacheSection: entry.cacheSection,
                })),
                editorMode: args.editorMode,
            }),
        );

        if (hadMiss) {
            const nextBlob = await withTimer("warmCache.repair", async () =>
                buildProjectWarmCacheBlob({
                    loadedProject: args.loadedProject,
                    files: hydratedEntries.map((entry) => entry.cacheSection),
                }),
            );
            await withTimer("warmCache.write", () =>
                args.projectWarmCacheProvider.write(
                    args.loadedProject.projectDir.path,
                    nextBlob,
                ),
            );
        }

        return parsed;
    } catch (error) {
        console.warn(
            "warm cache hydrate failed, rebuilding from live files",
            error,
        );
        const currentEntries = getLoadedProjectEntries(args.loadedProject);
        const rebuiltEntries = await withTimer("warmCache.repair", () =>
            Promise.all(
                currentEntries.map(async (entry) => ({
                    bookCode: entry.bookCode,
                    title: entry.title,
                    path: entry.path,
                    sort: entry.sort,
                    cacheSection: await buildFileSectionFromDisk({
                        loadedProject: args.loadedProject,
                        entry,
                        projectFingerprintService:
                            args.projectFingerprintService,
                    }),
                })),
            ),
        );
        const parsed = cachedEntriesToParsedFiles({
            entries: rebuiltEntries,
            editorMode: args.editorMode,
        });
        await withTimer("warmCache.write", () =>
            args.projectWarmCacheProvider.write(
                args.loadedProject.projectDir.path,
                buildProjectWarmCacheBlob({
                    loadedProject: args.loadedProject,
                    files: rebuiltEntries.map((entry) => entry.cacheSection),
                }),
            ),
        );
        return parsed;
    }
}
