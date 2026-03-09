import type { EditorModeSetting } from "@/app/data/editor.ts";
import { loadedProjectToParsedFiles } from "@/app/domain/api/loadedProjectToParsedFiles.ts";
import { ensureProjectGitReady } from "@/app/domain/git/ensureProjectGitReady.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";

export async function projectParamToParsedFiles(
    projectRepository: IProjectRepository,
    project: string | undefined,
    md5Service: IMd5Service,
    gitProvider: GitProvider,
    editorMode: EditorModeSetting,
    usfmOnionService: IUsfmOnionService,
) {
    if (project === "undefined") return;
    if (!project) return;

    const loadedProject = await projectRepository.loadProject(
        project,
        md5Service,
    );
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
        await loadedProjectToParsedFiles({
            loadedProject,
            editorMode,
            usfmOnionService,
        });

    console.timeEnd("parseAll");
    console.timeEnd("total load time");
    return { parsedFiles, allInitialLintErrors, loadedProject };
}
