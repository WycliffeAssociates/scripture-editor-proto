import { createFileRoute } from "@tanstack/react-router";

import { CreateProject } from "@/app/ui/components/views/CreateProject.tsx";

/**
 * Create/import route.
 *
 * This route stays at the app-shell level; the view it renders gathers user
 * intent, forwards it to the import facade, and reflects progress/result
 * notifications. Import branching and managed-disk shaping live below the UI.
 */
export const Route = createFileRoute("/create")({
  component: CreateProject,
});
