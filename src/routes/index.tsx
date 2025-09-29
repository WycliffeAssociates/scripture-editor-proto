import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useProjects } from "@/api/api";
import { Route as ProjectRoute } from "./projects/$projectId.edit";

export const Route = createFileRoute("/")({
    component: Index,
    // loader: async ({context}) => {
    //   const entries = await readDir(context.dirs.projects);
    //   const projectDirs = entries
    //     .filter((entry) => entry.isDirectory)
    //     .map((entry) => ({
    //       name: entry.name || "Unnamed Project",
    //       path: `${context.dirs.projects}${context.pathSeparator}${entry.name}`,
    //     }));
    //   return projectDirs;
    // },
});

// ls the app data dir and show as projects
function Index() {
    const { data: projects } = useProjects(useRouter().options.context);

    return (
        <ul className="p-2">
            {projects?.map((project) => (
                <li key={project.path}>
                    <Link
                        to={ProjectRoute.to}
                        params={{ projectId: project.path }}
                    >
                        {project.name}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
