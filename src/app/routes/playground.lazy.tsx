import { createLazyFileRoute } from "@tanstack/react-router";

/**
 * Internal profiling/maintenance route.
 *
 * This route exists for local experiments. (The numbered-marker node
 * prototype that lived here shipped — see nodes/USFMNumberedMarkerNode.ts
 * and tests/e2e/editor-numbered-markers.spec.ts.)
 */
export const Route = createLazyFileRoute("/playground")({
    component: PlaygroundRoute,
});

export function PlaygroundRoute() {
    // use ths file when just needing to write some logic or iterate on some ui in isolation
    return null;
}
