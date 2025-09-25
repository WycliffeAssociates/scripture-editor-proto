import {createFileRoute} from "@tanstack/react-router";
import {ProjectView} from "@/components/views/ProjectView";

export const Route = createFileRoute("/projects/$projectId/edit")({
  component: ProjectViewWrapper,
});

function ProjectViewWrapper() {
  const {projectId} = Route.useParams();
  console.log({projectId});
  return <ProjectView />;
}
