import type { ProjectWarmCacheBlob } from "@/app/domain/cache/ProjectWarmCacheProvider.ts";

export function normalizeProjectPath(projectPath: string): string {
    return projectPath.replace(/\\/gu, "/").replace(/\/+$/u, "");
}

export function projectRelativePath(
    projectPath: string,
    absolutePath: string,
): string {
    const normalizedProjectPath = normalizeProjectPath(projectPath);
    const normalizedAbsolutePath = normalizeProjectPath(absolutePath);
    if (normalizedAbsolutePath.startsWith(`${normalizedProjectPath}/`)) {
        return normalizedAbsolutePath.slice(normalizedProjectPath.length + 1);
    }
    return normalizedAbsolutePath;
}

export function isProjectWarmCacheBlob(
    value: unknown,
): value is ProjectWarmCacheBlob {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<ProjectWarmCacheBlob>;
    return (
        candidate.schemaVersion === 1 &&
        typeof candidate.projectPath === "string" &&
        typeof candidate.projectId === "string" &&
        (candidate.languageDirection === "ltr" ||
            candidate.languageDirection === "rtl") &&
        typeof candidate.updatedAtIso === "string" &&
        Array.isArray(candidate.files)
    );
}
