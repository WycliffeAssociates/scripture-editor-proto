import {
    createFileRoute,
    Link,
    useLoaderData,
    useRouter,
} from "@tanstack/react-router";
import { Project } from "@/core/persistence/ProjectRepository.ts";
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
                {projects?.map((project: Project) => (
                    <Link
                        key={project.projectDir.path}
                        to={projectRoute.id}
                        params={{ project: project.projectDir.name }}
                        onClick={() => {
                            console.log("Clicked on Project", project.id);
                            settingsManager.update({
                                lastProjectPath: project.projectDir.path,
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
