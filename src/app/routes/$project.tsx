import { Trans } from "@lingui/react/macro";
import { Center, Paper } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { projectParamToParsedFiles } from "@/app/domain/api/projectToParsed.tsx";
import { ProjectView } from "@/app/ui/components/views/ProjectView.tsx";
import { ProjectProvider } from "@/app/ui/contexts/WorkspaceContext.tsx";

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
        console.time("total time");
        const { projectRepository, md5Service, settingsManager } = context;
        const { project } = params;
        const editorMode = settingsManager.get("editorMode");
        const result = await projectParamToParsedFiles(
            projectRepository,
            project,
            md5Service,
            editorMode,
        );
        const { parsedFiles, allInitialLintErrors, loadedProject } = result || {
            parsedFiles: [],
            allInitialLintErrors: [],
            loadedProject: null,
        };
        return {
            projectFiles: parsedFiles,
            allInitialLintErrors,
            loadedProject,
        };
    },
});

function RouteComponent() {
    const { projectFiles, allInitialLintErrors, loadedProject } =
        Route.useLoaderData();

    const { project } = Route.useParams();
    const search = Route.useSearch();

    if (!loadedProject) return <Paper>Project not found</Paper>;
    return (
        <ProjectProvider
            currentProjectRoute={project}
            projectFiles={projectFiles}
            allInitialLintErrors={allInitialLintErrors}
            loadedProject={loadedProject}
            queryBookOverride={search.book}
            queryChapterOverride={search.chapter}
        >
            <ProjectView />
        </ProjectProvider>
    );
}
