import { createFileRoute } from "@tanstack/react-router";

import { ProjectRouteLayout } from "@/app/ui/components/views/ProjectRouteLayout.tsx";

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
