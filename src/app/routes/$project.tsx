import { Trans } from "@lingui/react/macro";
import { Center, Paper } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { projectParamToParsedScripture } from "@/app/domain/api/projectToParsed.tsx";
import { ProjectView } from "@/app/ui/components/views/ProjectView.tsx";
import { ProjectProvider } from "@/app/ui/contexts/WorkspaceContext.tsx";

/**
 * Main scripture editing route.
 *
 * Loader work has already reopened a managed path as a typed scripture noun and
 * projected it into workspace chapter state. The route component then hosts the
 * editor shell around that already-resolved scripture workspace.
 */
export const Route = createFileRoute("/$project")({
    component: RouteComponent,
    pendingComponent: () => (
        <Center style={{ height: "100vh", width: "100vw" }}>
            <Trans>
                <Paper p="md">Loading...</Paper>
            </Trans>
        </Center>
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
            fileSystem,
            gitProvider,
            settingsManager,
            usfmOnionService,
        } = context;
        const { project } = params;
        const editorMode = settingsManager.get("editorMode");
        const result = await projectParamToParsedScripture({
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
            <Paper>
                {rejectionReason === "not-editable"
                    ? "This resource cannot be opened in the editable workspace."
                    : "Project not found"}
            </Paper>
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
