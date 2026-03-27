import { createFileRoute } from "@tanstack/react-router";

/**
 * Thin route anchor so the lazy playground implementation can be code-split out of
 * the normal application bundle.
 */
export const Route = createFileRoute("/playground")({});
