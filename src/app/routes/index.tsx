import { createFileRoute, redirect } from "@tanstack/react-router";

import { IndexRoute } from "@/app/ui/components/views/IndexRoute.tsx";

/**
 * Home/library landing route for editable scripture items.
 *
 * The broader index/catalog can contain more item types, but this route presents
 * the current editable-project slice that leads into the main scripture workspace.
 */
export const Route = createFileRoute("/")({
  // First-run onboarding: with nothing on disk, send people straight to the
  // find/import surface rather than an empty project list.
  beforeLoad: async ({ context }) => {
    const projects = await context.projectsService.listProjects();
    if (projects.length === 0) {
      throw redirect({ to: "/create" });
    }
  },
  component: IndexRoute,
});
