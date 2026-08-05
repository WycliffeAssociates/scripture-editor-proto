import { Trans } from "@lingui/react/macro";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { analysisDisabledInMode } from "@/app/data/editor.ts";
import { materializeLoadedProject } from "@/app/domain/api/materializeLoadedProject.ts";
import { projectParamToParsedScripture } from "@/app/domain/api/projectToParsed.tsx";
import { dropBraidWarmCache } from "@/app/domain/mirror/braidWarmCache.ts";
import { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import {
  beginStartupTrace,
  logStartupPhase,
  startupElapsed,
  timeStartupPhase,
} from "@/app/domain/mirror/startupLog.ts";
import { createPhaseRecorder } from "@/app/domain/mirror/traceLog.ts";
import {
  reserveWorkspaceSlot,
  type WorkspaceKernelHandle,
} from "@/app/domain/mirror/workspaceKernel.ts";
import { galleyConfigFromSettings } from "@/app/domain/sous/galleyConfig.ts";
import { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";
import { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import { ProjectEditorRoute } from "@/app/ui/components/views/ProjectEditorRoute.tsx";
import * as styles from "@/app/ui/styles/modules/projectIndex.css.ts";
import { sortUsfmFilesByCanonicalOrder } from "@/core/data/bible/bible.ts";

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
  // The loader runs the whole project into view before the editor paints, in a
  // fixed order:
  //
  //   1. open the project (git readiness, book list) — no resident state yet
  //   2. RESERVE the single kernel slot, disposing any outgoing workspace first
  //   3. load: the resident host restores BOTH arms and returns bytes
  //   4. verify + materialize those bytes on main (tokens, findings)
  //   5. crash-recovery over the materialized books
  //   6. install the kernel (metadata seed + first-paint findings)
  //
  // Step 2 precedes step 3 deliberately: on desktop the resident corpus is one
  // process-wide state, so loading before arbitrating would overwrite the live
  // workspace before anyone decided it should be replaced. See
  // `reserveWorkspaceSlot`.
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

    const analysisDisabled = analysisDisabledInMode(editorMode);
    const proofreadingConfig = galleyConfigFromSettings(
      settingsManager.getSettings(),
    );

    // Crash-recovery stores. These are workspace-scoped and persist into the
    // ProjectProvider that this loader's data feeds; they are constructed here
    // (not in the component) so recovery runs in the async loader before the
    // editor mounts, eliminating any editor-mount race with restoration. A
    // reopen of a project the kernel already serves returns the kernel's
    // originals instead — the provider is not remounted, and a second set of
    // stores would split its state.
    const workspaceBaselineStore = new WorkspaceBaselineStore(md5Service);
    const recoveredConflictTracker = new RecoveredConflictTracker();
    const dirtyBufferStore = new DirtyBufferStore(
      fileSystem,
      md5Service,
      `${storageRoots.appDataRoot}/${DIRTY_BUFFER_ROOT_SUBDIR}`,
    );
    /**
     * No workspace to hand the provider: the project could not be opened, or a
     * preload declined to evict the live one. `kernel: null` is what the route
     * component renders its pending state on.
     */
    const noWorkspace = () => ({
      projectFiles: [],
      workspaceBaselineStore,
      recoveredConflictTracker,
      dirtyBufferStore,
      workspaceKey: "",
      restoredBookCodes: [] as string[],
      conflictedBookCodes: [] as string[],
      recoveryReportEntries: [],
      kernel: null as WorkspaceKernelHandle | null,
    });

    beginStartupTrace({ project, preload });
    // Opening the project happens before `hostLoadProject` runs, so its
    // sub-phases are recorded and replayed once the parent line is emitted.
    const openPhases = createPhaseRecorder();

    // 1–4. Open the project, arbitrate the kernel slot, then load and
    // materialize. Everything from the reservation onward lives inside this
    // callback because the workspace key — the identity the slot is arbitrated
    // on — only exists once the project is open.
    const result = await projectParamToParsedScripture({
      projectsService,
      libraryService,
      project,
      fileSystem,
      gitProvider,
      usfmOnionService,
      phases: openPhases,
      hostLoadProject: async (loadedProject) => {
        // Opening the project (git readiness, book listing) is everything the
        // trace has covered so far, so this closes that span rather than
        // wrapping the call — a wrapper would print after its own children.
        logStartupPhase(
          "main:open-project",
          { books: loadedProject.books.length },
          { startedAt: 0, durationMs: startupElapsed() },
          openPhases.phases,
        );
        // Identity contract for the kernel slot and crash-recovery backups: the
        // project's managed folder name. A stable, filesystem-safe single path
        // segment, unique per opened workspace.
        const workspaceKey = loadedProject.folderName;
        const reservation = await reserveWorkspaceSlot({
          projectKey: workspaceKey,
          preload,
        });
        if (reservation.kind !== "granted") return reservation;

        const feed = new MirrorFeed();
        const session = mirrorSessionFactory({
          feed,
          workspaceKey,
          dirtyBufferRoot: `${storageRoots.appDataRoot}/${DIRTY_BUFFER_ROOT_SUBDIR}`,
          fileSystem,
          cacheRoot: storageRoots.cacheRoot,
        });
        const runLoad = (attempt: "first" | "retry") =>
          timeStartupPhase(
            attempt === "first" ? "main:host:load" : "main:host:reload",
            () =>
              session.loadProject({
                generation: 0,
                projectPath: loadedProject.projectPath,
                workspaceKey,
                // Canonical order, because the resident corpus IS an ordered
                // array and main derives from that order. Books are
                // independent files, so a project's own listing order carries
                // no meaning worth preserving — but a mismatch here is silent:
                // main would address the same sids in a different order.
                books: sortUsfmFilesByCanonicalOrder(
                  loadedProject.books,
                  "bookCode",
                ).map((book) => ({
                  bookCode: book.bookCode,
                  sourceKey: book.bookCode,
                  path: book.path,
                })),
                config: proofreadingConfig,
                analysisDisabled,
              }),
            (value) => ({ state: value.state }),
            (value) => value.hostPhases,
          );

        try {
          await timeStartupPhase("main:host:ready", () => session.ready());
          const load = await runLoad("first");
          let materialized;
          try {
            materialized = materializeLoadedProject({ loadedProject, load });
          } catch (error) {
            // The container the host handed over did not certify here. On a
            // warm open that is a verdict on the SIDECAR, not on the project:
            // the host's own restore accepted bytes this side refuses (a
            // format change across versions, a binding that has since moved).
            // The sidecar is disposable by construction, so drop it and reload
            // — the host then cold-parses disk and republishes. Letting this
            // throw instead makes a stale cache file look like an unopenable
            // project, which is the one thing a disposable cache must never do.
            if (load.state !== "warm") throw error;
            console.warn(
              "[startup] warm container refused on main; dropping the sidecar and reloading cold",
              { workspaceKey, error },
            );
            await dropBraidWarmCache({
              fileSystem,
              cacheRoot: storageRoots.cacheRoot,
              workspaceKey,
            });
            const cold = await runLoad("retry");
            materialized = materializeLoadedProject({
              loadedProject,
              load: cold,
            });
          }
          return {
            ...reservation,
            ...materialized,
            feed,
            session,
          };
        } catch (error) {
          session.dispose();
          reservation.abort();
          throw error;
        }
      },
    });
    const { loadedProject, rejectionReason, hosted } = result ?? {
      loadedProject: null,
      rejectionReason: "not-found" as const,
      hosted: undefined,
    };
    if (rejectionReason === "metadata-invalid") {
      throw redirect({
        to: "/$project/metadata",
        params: { project },
        search: { issues: "open" },
      });
    }
    if (!loadedProject || !hosted) {
      return { ...noWorkspace(), loadedProject, rejectionReason };
    }
    const workspaceKey = loadedProject.folderName;

    // The slot already serves this project: its kernel owns the load it did,
    // and the still-mounted provider holds those exact store instances.
    if (hosted.kind === "reuse") {
      return {
        ...hosted.handle.load,
        loadedProject,
        rejectionReason,
        workspaceKey,
        kernel: hosted.handle,
      };
    }
    // A preload that would have evicted the live workspace: nothing was loaded,
    // and the real navigation re-runs this loader.
    if (hosted.kind === "declined") {
      return { ...noWorkspace(), loadedProject, rejectionReason };
    }

    // 5. Adopt the host's crash recovery. The host layered every usable backup
    // over the corpus while it had disk as the baseline beside it, so the books
    // materialized above are already the user's effective content and the
    // restored/conflicted sets are Braid's answer, not a token comparison here.
    // What remains on main is the state the app owns: the disk baselines the
    // backup pipeline writes against, and the per-chapter conflict tracker that
    // forces the first save through review.
    // `diskMd5ByBook` is the md5 of each book's real source bytes, hashed by
    // the resident host where it read them — no second read, no
    // re-serialization, no extra IPC.
    // TODO(burrito-md5): when a Scripture Burrito manifest records per-file
    // checksums, prefer those over hashing — but recompute defensively,
    // since files edited outside the app may not have updated the manifest.
    const recovery = hosted.recovery;
    for (const [bookCode, md5] of hosted.diskMd5ByBook) {
      workspaceBaselineStore.setPresent(bookCode, md5);
    }
    const conflicted = new Set(recovery.conflictedBookCodes);
    for (const book of hosted.parsedFiles) {
      if (!conflicted.has(book.bookCode)) continue;
      for (const chapter of book.chapters) {
        if (chapter.dirty) {
          recoveredConflictTracker.add(book.bookCode, chapter.chapterNumber);
        }
      }
    }
    logStartupPhase("main:recovery", {
      restored: recovery.restoredBookCodes.length,
      conflicted: recovery.conflictedBookCodes.length,
      reported: recovery.entries.length,
    });

    const load = {
      projectFiles: hosted.parsedFiles,
      workspaceBaselineStore,
      recoveredConflictTracker,
      dirtyBufferStore,
      restoredBookCodes: recovery.restoredBookCodes,
      conflictedBookCodes: recovery.conflictedBookCodes,
      recoveryReportEntries: recovery.entries,
    };

    // 6. Seed the mirror's metadata, settle first-paint findings, and take the
    // slot. Plain mode publishes no findings, matching the live gates.
    const kernel = await hosted.install({
      projectFiles: hosted.parsedFiles,
      workspaceBaselineStore,
      analysisDisabled,
      proofreadingConfig,
      feed: hosted.feed,
      session: hosted.session,
      braidFindings: hosted.braidFindings,
      galley: hosted.galley,
      load,
    });
    logStartupPhase("main:ready", {
      workspace: workspaceKey,
      books: hosted.parsedFiles.length,
      kernel: kernel ? "installed" : "superseded",
      total: `${Math.round(startupElapsed())}ms`,
    });

    return { ...load, loadedProject, rejectionReason, workspaceKey, kernel };
  },
});
