import type { ParsedFile } from "@/app/data/parsedProject.ts";
import {
    buildProjectWarmCacheBlob,
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
import type { Project } from "@/core/persistence/ProjectRepository.ts";

async function buildSectionFromText(args: {
    loadedProject: Project;
    file: Project["files"][number];
    relativePath: string;
    text: string;
    projectFingerprintService: ProjectFingerprintService;
}): Promise<CachedFileSection> {
    const bytes = new TextEncoder().encode(args.text);
    const checksumSha1 = await args.projectFingerprintService.sha1(bytes);
    return parseBookTextToCachedFileSection({
        relativePath: args.relativePath,
        checksumSha1,
        bookCode: args.file.bookCode,
        title: args.file.title,
        sort: args.file.sort,
        text: args.text,
        languageDirection: args.loadedProject.metadata.language.direction,
    });
}

async function buildSectionFromDisk(args: {
    loadedProject: Project;
    file: Project["files"][number];
    relativePath: string;
    projectFingerprintService: ProjectFingerprintService;
}): Promise<CachedFileSection> {
    const rootDir = args.loadedProject.projectDir.asDirectoryHandle();
    if (!rootDir) {
        throw new Error("Project directory is not readable.");
    }
    const fileHandle = await rootDir.getFileHandle(args.relativePath);
    const file = await fileHandle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksumSha1 = await args.projectFingerprintService.sha1(bytes);
    const text = new TextDecoder().decode(bytes);
    return parseBookTextToCachedFileSection({
        relativePath: args.relativePath,
        checksumSha1,
        bookCode: args.file.bookCode,
        title: args.file.title,
        sort: args.file.sort,
        text,
        languageDirection: args.loadedProject.metadata.language.direction,
    });
}

export async function refreshProjectWarmCache(args: {
    loadedProject: Project;
    workingFiles: ParsedFile[];
    savedBookContentsByCode: Record<string, string>;
    projectWarmCacheProvider: ProjectWarmCacheProvider;
    projectFingerprintService: ProjectFingerprintService;
}): Promise<void> {
    const existingBlob = await args.projectWarmCacheProvider.read(
        args.loadedProject.projectDir.path,
    );
    const existingSectionsByPath = new Map(
        existingBlob && isProjectWarmCacheBlob(existingBlob)
            ? existingBlob.files.map((section) => [
                  section.relativePath,
                  section,
              ])
            : [],
    );
    void args.workingFiles;

    const nextSections = await Promise.all(
        args.loadedProject.files.map(async (file) => {
            const relativePath = projectRelativePath(
                args.loadedProject.projectDir.path,
                file.path,
            );
            const savedText = args.savedBookContentsByCode[file.bookCode];
            if (savedText !== undefined) {
                return buildSectionFromText({
                    loadedProject: args.loadedProject,
                    file,
                    relativePath,
                    text: savedText,
                    projectFingerprintService: args.projectFingerprintService,
                });
            }
            const existingSection = existingSectionsByPath.get(relativePath);
            if (existingSection) {
                return existingSection;
            }
            return buildSectionFromDisk({
                loadedProject: args.loadedProject,
                file,
                relativePath,
                projectFingerprintService: args.projectFingerprintService,
            });
        }),
    );

    await args.projectWarmCacheProvider.write(
        args.loadedProject.projectDir.path,
        buildProjectWarmCacheBlob({
            loadedProject: args.loadedProject,
            files: nextSections,
        }),
    );
}
