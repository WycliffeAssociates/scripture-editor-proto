import { Trans } from "@lingui/react/macro";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { projectParamToParsedScripture } from "@/app/domain/api/projectToParsed.tsx";
import { ProjectView } from "@/app/ui/components/views/ProjectView.tsx";
import { ProjectProvider } from "@/app/ui/contexts/WorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/projectIndex.css.ts";

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
        });
        const {
            parsedFiles,
            initialLintErrorsByBook,
            loadedProject,
            rejectionReason,
        } = result || {
            parsedFiles: [],
            initialLintErrorsByBook: {},
            loadedProject: null,
            rejectionReason: "not-found" as const,
        };
        if (rejectionReason === "metadata-invalid") {
            throw redirect({
                to: "/$project/metadata",
                params: { project },
                search: { issues: "open" },
            });
        }
        return {
            projectFiles: parsedFiles,
            initialLintErrorsByBook,
            loadedProject,
            rejectionReason,
        };
    },
});

function RouteComponent() {
    const {
        projectFiles,
        initialLintErrorsByBook,
        loadedProject,
        rejectionReason,
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
            queryBookOverride={search.book}
            queryChapterOverride={search.chapter}
        >
            <ProjectView />
        </ProjectProvider>
    );
}
