import { createFileRoute } from "@tanstack/react-router";

import { ScaffoldRoute } from "@/app/ui/components/views/ScaffoldRoute.tsx";

/**
 * Internal scaffold/style-guide route.
 */
export const Route = createFileRoute("/scaffold")({
  component: ScaffoldRoute,
});
