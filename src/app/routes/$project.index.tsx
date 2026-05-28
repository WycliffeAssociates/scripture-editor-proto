import { Trans } from "@lingui/react/macro";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { projectParamToParsedScripture } from "@/app/domain/api/projectToParsed.tsx";
import { recoverDirtyBuffers } from "@/app/domain/api/recoverDirtyBuffers.ts";
import { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";
import { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import { ProjectView } from "@/app/ui/components/views/ProjectView.tsx";
import { ProjectProvider } from "@/app/ui/contexts/WorkspaceContext.tsx";
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
    component: RouteComponent,
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
    loader: async ({ context, params }) => {
        const {
            libraryService,
            projectsService,
            fileSystem,
            md5Service,
            storageRoots,
            gitProvider,
            settingsManager,
            usfmOnionService,
        } = context;
        const { project } = params;
        const editorMode = settingsManager.get("editorMode");
        const result = await projectParamToParsedScripture({
            projectsService,
            libraryService,
            project,
            fileSystem,
            gitProvider,
            editorMode,
            usfmOnionService,
            // Ask the parser for per-book source md5s so crash recovery can
            // baseline without re-reading or re-serializing.
            includeSourceMd5: true,
        });
        const {
            parsedFiles,
            initialLintErrorsByBook,
            loadedProject,
            rejectionReason,
            diskMd5ByBook,
        } = result || {
            parsedFiles: [],
            initialLintErrorsByBook: {},
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
                initialLintErrorsByBook,
                loadedProject,
                rejectionReason,
                workspaceBaselineStore,
                recoveredConflictTracker,
                dirtyBufferStore,
                workspaceKey: "",
                restoredBookCodes: [] as string[],
                conflictedBookCodes: [] as string[],
                recoveryReportEntries: [],
            };
        }

        // Identity contract for crash-recovery backups: the project's managed
        // folder name. It's a stable, filesystem-safe single path segment derived
        // from the managed project path basename — unique per opened workspace,
        // which is all the single-window/no-multi-tab model requires.
        const workspaceKey = loadedProject.folderName;

        // `diskMd5ByBook` is the md5 of each book's real source bytes, hashed by
        // the parser where it already read them (Rust for desktop path IO, JS
        // for web content IO) — no second read, no re-serialization, no extra
        // IPC. Recovery + the dirty-buffer pipeline compare against it to tell
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
            editorMode,
            usfmOnionService,
            initialLintErrorsByBook,
        });

        return {
            projectFiles: recovery.parsedFiles,
            initialLintErrorsByBook: recovery.initialLintErrorsByBook,
            loadedProject,
            rejectionReason,
            workspaceBaselineStore,
            recoveredConflictTracker,
            dirtyBufferStore,
            workspaceKey,
            restoredBookCodes: recovery.restoredBookCodes,
            conflictedBookCodes: recovery.conflictedBookCodes,
            recoveryReportEntries: recovery.recoveryReportEntries,
        };
    },
});

function RouteComponent() {
    const {
        projectFiles,
        initialLintErrorsByBook,
        loadedProject,
        rejectionReason,
        workspaceBaselineStore,
        recoveredConflictTracker,
        dirtyBufferStore,
        workspaceKey,
        restoredBookCodes,
        conflictedBookCodes,
        recoveryReportEntries,
    } = Route.useLoaderData();

    const { project } = Route.useParams();
    const search = Route.useSearch();

    if (!loadedProject) {
        return (
            <div className={styles.pendingPaper}>
                {rejectionReason === "not-editable"
                    ? "This resource cannot be opened in the editable workspace."
                    : "Project not found"}
            </div>
        );
    }
    return (
        <ProjectProvider
            currentProjectRoute={project}
            projectFiles={projectFiles}
            initialLintErrorsByBook={initialLintErrorsByBook}
            loadedProject={loadedProject}
            workspaceBaselineStore={workspaceBaselineStore}
            recoveredConflictTracker={recoveredConflictTracker}
            dirtyBufferStore={dirtyBufferStore}
            workspaceKey={workspaceKey}
            restoredBookCodes={restoredBookCodes}
            conflictedBookCodes={conflictedBookCodes}
            recoveryReportEntries={recoveryReportEntries}
            queryBookOverride={search.book}
            queryChapterOverride={search.chapter}
        >
            <ProjectView />
        </ProjectProvider>
    );
}
