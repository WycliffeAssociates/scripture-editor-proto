import type { EditorModeSetting } from "@/app/data/editor.ts";
import { loadProjectWithWarmCache } from "@/app/domain/cache/loadProjectWithWarmCache.ts";
import type { ProjectFingerprintService } from "@/app/domain/cache/ProjectFingerprintService.ts";
import type { ProjectWarmCacheProvider } from "@/app/domain/cache/ProjectWarmCacheProvider.ts";
import { ensureProjectGitReady } from "@/app/domain/git/ensureProjectGitReady.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";

export async function projectParamToParsedFiles(
    projectRepository: IProjectRepository,
    project: string | undefined,
    md5Service: IMd5Service,
    gitProvider: GitProvider,
    projectWarmCacheProvider: ProjectWarmCacheProvider,
    projectFingerprintService: ProjectFingerprintService,
    editorMode: EditorModeSetting,
) {
    if (project === "undefined") return;
    if (!project) return;

    console.time("projectRepository.loadProject");
    const loadedProject = await projectRepository.loadProject(
        project,
        md5Service,
    );
    console.timeEnd("projectRepository.loadProject");

    if (!loadedProject) return;
    console.time("total load time");
    console.time("ensureProjectGitReady");
    await ensureProjectGitReady({
        gitProvider,
        loadedProject,
    });
    console.timeEnd("ensureProjectGitReady");

    console.time("parseAll");
    const { parsedFiles, allInitialLintErrors } =
        await loadProjectWithWarmCache({
            loadedProject,
            editorMode,
            projectWarmCacheProvider,
            projectFingerprintService,
        });

    console.timeEnd("parseAll");
    console.timeEnd("total load time");
    return { parsedFiles, allInitialLintErrors, loadedProject };
}
