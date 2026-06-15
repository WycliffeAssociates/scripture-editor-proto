import { createFileRoute } from "@tanstack/react-router";

import { MetadataRoute } from "@/app/ui/components/views/MetadataRoute.tsx";

export const Route = createFileRoute("/$project/metadata")({
  validateSearch: (
    search: Partial<Record<string, unknown>>,
  ): { issues?: "open" } => ({
    issues: search.issues === "open" ? "open" : undefined,
  }),
  loader: async ({ context, params, location }) => {
    const document = await context.projectsService.loadMetadataEditor(
      params.project,
      {
        includeIssues:
          new URLSearchParams(location.search).get("issues") === "open",
      },
    );

    return {
      document,
    };
  },
  component: MetadataRoute,
});
