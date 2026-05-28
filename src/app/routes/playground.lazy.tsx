import { createLazyFileRoute } from "@tanstack/react-router";

/**
 * Internal profiling/maintenance route.
 *
 * This route exists for local experiments
 */
export const Route = createLazyFileRoute("/playground")({
    component: PlaygroundRoute,
});

export function PlaygroundRoute() {
    // use ths file when just needing to write some logic or iterate on some ui in isolation
    return null;
}
