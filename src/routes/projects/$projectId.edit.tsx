import { createFileRoute } from "@tanstack/react-router";
import {ProjectView} from "@/ui/components/views/ProjectView.tsx";

export const Route = createFileRoute("/projects/$projectId/edit")({
    component: ProjectViewWrapper,
});

function ProjectViewWrapper() {
    const { projectId } = Route.useParams();
    console.log({ projectId });
    return <ProjectView />;
}
