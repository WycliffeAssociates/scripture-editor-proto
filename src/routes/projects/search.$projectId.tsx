import { useQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { toast } from "sonner";
import { projectFilesQueryOptions } from "@/api/api";
import { DelayedLoader } from "@/components/primitives/delayedLoader";

export const Route = createFileRoute("/projects/search/$projectId")({
    component: SearchPage,
});

function SearchPage() {
    const { projectId } = Route.useParams();
    const { pathSeparator } = Route.useRouteContext();
    const query = useQuery(projectFilesQueryOptions(projectId, pathSeparator));

    if (query.isLoading) {
        return (
            <DelayedLoader
                isLoading
                delay={200}
                fallback={<div>Loading files…</div>}
            />
        );
    }
    if (query.isError) {
        return toast.error(String(query.error), { duration: 5000 });
    }
    if (!query.data) return <div>No files found</div>;
    return <div>Searching in project: {projectId}</div>;
}
