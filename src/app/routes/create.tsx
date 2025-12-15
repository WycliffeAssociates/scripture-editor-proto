import { Trans } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/create")({
    component: RouteComponent,
});

function RouteComponent() {
    return (
        <div>
            <Trans>Hello "/create"!</Trans>
        </div>
    );
}
