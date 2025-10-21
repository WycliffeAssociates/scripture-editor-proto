import {
    createFileRoute,
    Link,
    useLoaderData,
    useRouter,
} from "@tanstack/react-router";
import { Route as projectRoute } from "./$project";
// import { Route as ProjectRoute } from '@/app/routes/projects/$projectId.edit';

export const Route = createFileRoute("/")({
    component: Index,
});

// ls the app data dir and show as projects
function Index() {
    const { projects } = useLoaderData({ from: "__root__" });
    const { settingsManager } = useRouter().options.context;
    return (
        <div>
            <h1>Projects</h1>
            <ul>
                {projects?.map((project) => (
                    <Link
                        key={project.path}
                        to={projectRoute.id}
                        params={{ project: project.path }}
                        onClick={() => {
                            settingsManager.update({
                                lastProjectPath: project.path,
                            });
                        }}
                    >
                        {project.name}
                    </Link>
                ))}
            </ul>
        </div>
    );
}
