import { createFileRoute } from "@tanstack/react-router";

/**
 * Internal scaffold/style-guide route.
 */
export const Route = createFileRoute("/scaffold")({
    component: RouteComponent,
});

export function RouteComponent() {
    return <div>Hello "/scaffold"!</div>;
}
