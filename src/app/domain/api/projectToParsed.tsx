import type { EditorModeSetting } from "@/app/data/editor.ts";
import { scriptureProjectToParsedFiles } from "@/app/domain/api/scriptureProjectToParsedFiles.ts";
import type { LibraryService } from "@/app/library/LibraryService.ts";
import { openEditableScripture } from "@/app/scripture/openEditableScripture.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { UsfmScriptureItem } from "@/core/library/LibraryItem.ts";
import { ensureProjectGitReady } from "@/core/persistence/ensureProjectGitReady.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";

type OpenProjectFn = (
    projectRef: string,
) => Promise<UsfmScriptureItem | Project | null>;

/**
 * Convert a route/project reference into the parsed scripture workspace payload
 * the editor screen needs.
 *
 * This function sits exactly at the boundary between "routing/opening" and
 * "scripture workspace state". It decides whether to open the editable
 * scripture path or a read-only scripture path, ensures git readiness only for
 * the editable case, and then delegates to the parser that builds
 * `ScriptureBookState[]`.
 */
export async function projectParamToParsedScripture(args: {
    projectsService?: ProjectsService;
    libraryService?: LibraryService;
    openProjectReadOnly?: OpenProjectFn;
    project: string | undefined;
    fileSystem: FileSystem;
    gitProvider: GitProvider;
    editorMode: EditorModeSetting;
    usfmOnionService: IUsfmOnionService;
    /**
     * Request per-book source md5s (`diskMd5ByBook`) for crash-recovery
     * baselines. Only the editable workspace load sets this; reference loading
     * leaves it off so it doesn't hash resources it never recovers.
     */
    includeSourceMd5?: boolean;
}) {
    if (args.project === "undefined") return;
    if (!args.project) return;

    const editableResult =
        args.openProjectReadOnly || args.projectsService
            ? args.projectsService
                ? await args.projectsService.openEditableProject(args.project)
                : null
            : !args.libraryService
              ? null
              : await openEditableScripture({
                    libraryService: args.libraryService,
                    itemRef: args.project,
                });
    const loadedProject = args.openProjectReadOnly
        ? await args.openProjectReadOnly(args.project)
        : (editableResult?.project ?? null);
    if (!loadedProject) {
        return {
            parsedFiles: [],
            initialLintErrorsByBook: {},
            loadedProject: null,
            rejectionReason: editableResult?.rejectionReason ?? "not-found",
            diskMd5ByBook: new Map<string, string>(),
        };
    }

    if (!args.openProjectReadOnly) {
        await ensureProjectGitReady({
            fileSystem: args.fileSystem,
            gitProvider: args.gitProvider,
            loadedProject,
        });
    }
    const { parsedFiles, initialLintErrorsByBook, diskMd5ByBook } =
        await scriptureProjectToParsedFiles({
            loadedProject,
            editorMode: args.editorMode,
            usfmOnionService: args.usfmOnionService,
            includeSourceMd5: args.includeSourceMd5,
        });
    return {
        parsedFiles,
        initialLintErrorsByBook,
        loadedProject,
        rejectionReason: null,
        diskMd5ByBook,
    };
}
