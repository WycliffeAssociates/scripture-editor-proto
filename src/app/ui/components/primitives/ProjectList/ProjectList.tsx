import { Trans } from "@lingui/react/macro";
import { Button, Divider, Menu } from "@mantine/core";
import { Link, useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useWorkspaceContext } from "../../../contexts/WorkspaceContext.tsx";
import classnames from "./ProjectList.module.css";
export function ProjectList() {
    const { allProjects, project, currentProjectRoute } = useWorkspaceContext();
    const router = useRouter();
    const currentProject = allProjects.find(
        (p) => p.projectDir.name === currentProjectRoute,
    );
    const navigateToNewProject = (projectId: string) => {
        project.updateAppSettings({
            lastProjectPath: projectId,
        });
        router.navigate({
            to: `/$project`,
            params: { project: projectId },
            reloadDocument: true,
        });
    };
    return (
        <div>
            <ul>
                {allProjects.map((project) => (
                    <li
                        key={project.projectDir.path}
                        onClick={() =>
                            navigateToNewProject(project.projectDir.name)
                        }
                        onKeyUp={(e) => {
                            if (e.key === "Enter") {
                                navigateToNewProject(project.projectDir.name);
                            }
                        }}
                        className={`${currentProject?.name === project.name && classnames.picked} ${classnames.project}`}
                    >
                        {project.name}
                    </li>
                ))}
            </ul>
            <Link to="/" className={classnames.newProject}>
                <Trans>New Project</Trans>
                <Plus />
            </Link>
        </div>
    );
}
