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
    projectsService?: never;
    libraryService?: LibraryService;
    openProjectReadOnly?: OpenProjectFn;
    project: string | undefined;
    fileSystem: FileSystem;
    gitProvider: GitProvider;
    editorMode: EditorModeSetting;
    usfmOnionService: IUsfmOnionService;
}) {
    if (args.project === "undefined") return;
    if (!args.project) return;

    const editableResult =
        args.openProjectReadOnly || !args.libraryService
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
        };
    }

    if (!args.openProjectReadOnly) {
        await ensureProjectGitReady({
            fileSystem: args.fileSystem,
            gitProvider: args.gitProvider,
            loadedProject,
        });
    }
    const { parsedFiles, initialLintErrorsByBook } =
        await scriptureProjectToParsedFiles({
            loadedProject,
            editorMode: args.editorMode,
            usfmOnionService: args.usfmOnionService,
        });
    return {
        parsedFiles,
        initialLintErrorsByBook,
        loadedProject,
        rejectionReason: null,
    };
}
