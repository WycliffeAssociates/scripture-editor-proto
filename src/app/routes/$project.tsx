import { createFileRoute } from "@tanstack/react-router";
import { projectParamToParsedFiles } from "@/app/domain/api/projectToParsed.tsx";
import { ProjectView } from "@/app/ui/components/views/ProjectView.tsx";
import { ProjectProvider } from "@/app/ui/contexts/WorkspaceContext.tsx";

export const Route = createFileRoute("/$project")({
  component: RouteComponent,
  pendingComponent: () => (
    <div className="h-screen w-screen grid place-items-center">Loading...</div>
  ),
  pendingMs: 100,
  loader: async ({ context, params }) => {
    console.time("total time");
    // start here would prefer to wrap into a single abstraction
    const { projectRepository } = context;
    const { project } = params;
    const result = await projectParamToParsedFiles(projectRepository, project);
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
  if (!loadedProject) return <div>Project not found</div>;
  return (
    <ProjectProvider
      currentProjectRoute={project}
      projectFiles={projectFiles}
      allInitialLintErrors={allInitialLintErrors}
      loadedProject={loadedProject}
    >
      <ProjectView />
    </ProjectProvider>
  );
}
