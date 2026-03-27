import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { RouterContext } from "@/app/entrypoint.tsx";

/**
 * Root route for app-shell concerns that are shared across all child routes.
 */
export const Route = createRootRouteWithContext<RouterContext>()({
    loader: async ({ context }) => ({
        projects: await context.projectsService.listProjects(),
    }),
    component: RootComponent,
});

function RootComponent() {
    return <Outlet />;
}
