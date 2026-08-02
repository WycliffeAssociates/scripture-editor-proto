import { Trans } from "@lingui/react/macro";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { analysisDisabledInMode, shapeForSurface } from "@/app/data/editor.ts";
import { projectParamToParsedScripture } from "@/app/domain/api/projectToParsed.tsx";
import { recoverDirtyBuffers } from "@/app/domain/api/recoverDirtyBuffers.ts";
import {
  acquireWorkspaceKernel,
  type WorkspaceKernelHandle,
} from "@/app/domain/mirror/workspaceKernel.ts";
import { galleyConfigFromSettings } from "@/app/domain/sous/galleyConfig.ts";
import { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";
import { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import { ProjectEditorRoute } from "@/app/ui/components/views/ProjectEditorRoute.tsx";
import * as styles from "@/app/ui/styles/modules/projectIndex.css.ts";

const DIRTY_BUFFER_ROOT_SUBDIR = "dirty-buffers";

/**
 * Main scripture editing route.
 *
 * Loader work has already reopened a managed path as a typed scripture noun and
 * projected it into workspace chapter state. The route component then hosts the
 * editor shell around that already-resolved scripture workspace.
 */
export const Route = createFileRoute("/$project/")({
  component: ProjectEditorRoute,
  pendingComponent: () => (
    <div className={styles.pendingRoot}>
      <div className={styles.pendingPaper}>
        <Trans>Loading...</Trans>
      </div>
    </div>
  ),
  pendingMs: 100,
  validateSearch: (
    search: Partial<Record<string, unknown>>,
  ): { book?: string; chapter?: number } => {
    return {
      book: search.book as string | undefined,
      chapter: search.chapter ? Number(search.chapter) : undefined,
    };
  },
  // The loader runs the whole project into view before the editor paints: it
  // parses, checks for crash backups, then — via the kernel registry — spawns
  // the mirror, awaits its engines, seeds it, and awaits the initial project
  // findings. Each step below is the first call of a pipeline-shaped capability
  // the running app reuses (parse, recover, seed, analyze). The kernel handle +
  // its initial findings ride in loader data; the provider claims the kernel
  // and commits the findings before first paint.
  loader: async ({ context, params, preload }) => {
    const {
      libraryService,
      projectsService,
      fileSystem,
      md5Service,
      storageRoots,
      gitProvider,
      settingsManager,
      usfmOnionService,
      mirrorSessionFactory,
    } = context;
    const { project } = params;
    // The loader is boot wiring — the one place mode is read straight off
    // the settings manager and resolved to a shape for the load.
    const editorMode = settingsManager.get("editorMode");
    const editorShape = shapeForSurface("mainEditor", editorMode);

    // parseProject — reopen the managed path as a typed scripture noun.
    const result = await projectParamToParsedScripture({
      projectsService,
      libraryService,
      project,
      fileSystem,
      gitProvider,
      shape: editorShape,
      usfmOnionService,
      // Ask the parser for per-book source md5s so crash recovery can
      // baseline without re-reading or re-serializing.
      includeSourceMd5: true,
    });
    const { parsedFiles, loadedProject, rejectionReason, diskMd5ByBook } =
      result || {
        parsedFiles: [],
        loadedProject: null,
        rejectionReason: "not-found" as const,
        diskMd5ByBook: new Map<string, string>(),
      };
    if (rejectionReason === "metadata-invalid") {
      throw redirect({
        to: "/$project/metadata",
        params: { project },
        search: { issues: "open" },
      });
    }

    // Crash-recovery: these workspace-scoped stores persist into the
    // ProjectProvider that this loader's data feeds. Constructed here (not
    // in the component) so recovery runs in the async loader before the
    // editor mounts — eliminating any editor-mount race with restoration.
    const workspaceBaselineStore = new WorkspaceBaselineStore(md5Service);
    const recoveredConflictTracker = new RecoveredConflictTracker();
    const dirtyBufferStore = new DirtyBufferStore(
      fileSystem,
      md5Service,
      `${storageRoots.appDataRoot}/${DIRTY_BUFFER_ROOT_SUBDIR}`,
    );

    if (!loadedProject) {
      return {
        projectFiles: parsedFiles,
        loadedProject,
        rejectionReason,
        workspaceBaselineStore,
        recoveredConflictTracker,
        dirtyBufferStore,
        workspaceKey: "",
        restoredBookCodes: [] as string[],
        conflictedBookCodes: [] as string[],
        recoveryReportEntries: [],
        kernel: null as WorkspaceKernelHandle | null,
      };
    }

    // Identity contract for crash-recovery backups: the project's managed
    // folder name. It's a stable, filesystem-safe single path segment derived
    // from the managed project path basename — unique per opened workspace,
    // which is all the single-window/no-multi-tab model requires.
    const workspaceKey = loadedProject.folderName;

    // checkForCrashBackupFiles — restore any per-book dirty buffers and
    // baseline disk md5s. `diskMd5ByBook` is the md5 of each book's real source
    // bytes, hashed by the parser where it already read them (Rust for desktop
    // path IO, JS for web content IO) — no second read, no re-serialization, no
    // extra IPC. Recovery + the dirty-buffer pipeline compare against it to tell
    // "disk moved underneath this backup" from "backup matches disk".
    // A book missing from the map (read/hash failure, or an old desktop
    // binary that predates `sourceMd5`) is simply left un-baselined, so any
    // backup for it falls to forced review — the safe default.
    // TODO(burrito-md5): when a Scripture Burrito manifest records per-file
    // checksums, prefer those over hashing — but recompute defensively,
    // since files edited outside the app may not have updated the manifest.
    const recovery = await recoverDirtyBuffers({
      parsedFiles,
      diskMd5ByBook,
      dirtyBufferStore,
      workspaceBaselineStore,
      recoveredConflictTracker,
      workspaceKey,
      direction: loadedProject.language.direction,
      shape: editorShape,
      usfmOnionService,
    });

    // spawnMirrors → awaitEnginesReady → seedMirrors → initialFindings, all
    // behind the single-slot kernel registry. On a preload that would evict the
    // open workspace the registry returns null and we skip kernel work (the open
    // project keeps its one worker set); the provider then builds nothing and
    // the warmed-or-live kernel is claimed on the real navigation. Plain mode
    // disables analysis, so the kernel skips the initial findings pass.
    const kernel = await acquireWorkspaceKernel({
      preload,
      projectKey: workspaceKey,
      projectFiles: recovery.parsedFiles,
      workspaceBaselineStore,
      dirtyBufferRoot: dirtyBufferStore.rootDirectory(),
      mirrorSessionFactory,
      analysisDisabled: analysisDisabledInMode(editorMode),
      proofreadingConfig: galleyConfigFromSettings(
        settingsManager.getSettings(),
      ),
      fileSystem,
      cacheRoot: storageRoots.cacheRoot,
    });

    return {
      projectFiles: recovery.parsedFiles,
      loadedProject,
      rejectionReason,
      workspaceBaselineStore,
      recoveredConflictTracker,
      dirtyBufferStore,
      workspaceKey,
      restoredBookCodes: recovery.restoredBookCodes,
      conflictedBookCodes: recovery.conflictedBookCodes,
      recoveryReportEntries: recovery.recoveryReportEntries,
      kernel,
    };
  },
});
