import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/search")({
    component: RouteComponent,
});

function RouteComponent() {
    const { projectId } = Route.useParams();
    return <div>Hello {projectId}</div>;
}
