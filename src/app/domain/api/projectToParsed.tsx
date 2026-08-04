import { scriptureProjectToParsedFiles } from "@/app/domain/api/scriptureProjectToParsedFiles.ts";
import type { PhaseRecorder } from "@/app/domain/mirror/traceLog.ts";
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
export async function projectParamToParsedScripture<THosted>(args: {
  projectsService?: ProjectsService;
  libraryService?: LibraryService;
  openProjectReadOnly?: OpenProjectFn;
  project: string | undefined;
  fileSystem: FileSystem;
  gitProvider: GitProvider;
  usfmOnionService: IUsfmOnionService;
  /**
   * Optional trace recorder. The editable route passes one so opening the
   * project shows up as phases inside its startup trace; every other caller
   * (reference panes, compare) omits it and records nothing.
   */
  phases?: PhaseRecorder;
  /**
   * Host-owned resident load, used by the editable workspace route. It runs
   * only once the project is open and its workspace key is known, because that
   * key is what the caller arbitrates kernel ownership on before it is allowed
   * to touch resident state.
   */
  hostLoadProject?: (loadedProject: Project) => Promise<THosted>;
}) {
  if (args.project === "undefined") return;
  if (!args.project) return;

  const openProject = args.projectsService;
  const editableResult =
    args.openProjectReadOnly || openProject
      ? openProject
        ? await record(args.phases, "main:open:project", () =>
            openProject.openEditableProject(args.project as string),
          )
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
      loadedProject: null,
      rejectionReason: editableResult?.rejectionReason ?? "not-found",
      diskMd5ByBook: new Map<string, string>(),
      hosted: undefined,
    };
  }

  if (!args.openProjectReadOnly) {
    await record(args.phases, "main:open:git-ready", () =>
      ensureProjectGitReady({
        fileSystem: args.fileSystem,
        gitProvider: args.gitProvider,
        loadedProject,
      }),
    );
  }
  if (!args.openProjectReadOnly) {
    if (!args.hostLoadProject) {
      throw new Error(
        "Editable scripture loads require a resident mirror host",
      );
    }
    return {
      parsedFiles: [],
      loadedProject,
      rejectionReason: null,
      diskMd5ByBook: new Map<string, string>(),
      hosted: await args.hostLoadProject(loadedProject),
    };
  }
  const { parsedFiles, diskMd5ByBook } = await scriptureProjectToParsedFiles({
    loadedProject,
    usfmOnionService: args.usfmOnionService,
  });
  return {
    parsedFiles,
    loadedProject,
    rejectionReason: null,
    diskMd5ByBook,
    hosted: undefined,
  };
}

/** Time `operation` into `phases` when a caller supplied a recorder. */
function record<T>(
  phases: PhaseRecorder | undefined,
  phase: string,
  operation: () => Promise<T>,
): Promise<T> {
  return phases ? phases.time(phase, operation) : operation();
}
