import {
    createFileRoute,
    Outlet,
    useLoaderData,
    useRouter,
} from "@tanstack/react-router";
import {
    projectFilesQueryOptions,
    useProjectFiles,
    useProjects,
} from "@/api/api";
import { DelayedLoader } from "@/components/primitives/delayedLoader";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { AppPreferences } from "@/customTypes/types";

export const Route = createFileRoute("/projects/$projectId")({
    component: ProjectProviderWrapper,
    loader: ({ context, params }) => {
        return context.queryClient.ensureQueryData(
            projectFilesQueryOptions(params.projectId, context.pathSeparator),
        );
    },
    pendingMs: 100,
    pendingComponent: () => <div>Loading project…</div>,
});

function ProjectProviderWrapper() {
    const { projectId } = Route.useParams();
    const projectsQuery = useProjects(useRouter().options.context);
    const { pathSeparator } = Route.useRouteContext();
    const files = Route.useLoaderData();
    const appPreferences = localStorage.getItem("appPreferences");
    let appPreferencesParsed: AppPreferences;
    try {
        appPreferencesParsed = appPreferences ? JSON.parse(appPreferences) : {};
    } catch (e) {
        console.error("Error parsing appPreferences", e);
        appPreferencesParsed = {} as AppPreferences;
    }

    if (!files) {
        return <div>No files found</div>;
        // return (
        //   <DelayedLoader
        //     isLoading
        //     delay={200}
        //     fallback={<div>Loading files…</div>}
        //   />
        // );
    }
    if (projectsQuery.isLoading) {
        return <div>Loading project…</div>;
    }
    if (projectsQuery.isError) {
        return <div>Error loading project: {String(projectsQuery.error)}</div>;
    }
    if (!projectsQuery.data) {
        return <div>No projects found</div>;
    }

    // if (query.isError)
    //   return <div>Error loading project: {String(query.error)}</div>;
    // if (!query.data) return <div>No files found</div>;

    return (
        <ProjectProvider
            projectPath={projectId}
            files={files}
            pathSeparator={pathSeparator}
            allProjects={projectsQuery.data}
            initialAppPreferences={appPreferencesParsed}
        >
            <Outlet /> {/* renders either edit or search route. todo, probs */}
        </ProjectProvider>
    );
}
