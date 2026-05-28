import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Project route layout.
 *
 * The scripture editor and metadata editor both live under the same project
 * path. This route exists only to host the shared dynamic segment and render
 * whichever child view matched.
 */
export const Route = createFileRoute("/$project")({
    component: ProjectRouteLayout,
});

export function ProjectRouteLayout() {
    return <Outlet />;
}
