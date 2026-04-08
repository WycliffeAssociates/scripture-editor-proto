import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "./projectSwitcher.css.ts";

type ProjectSwitcherItem = {
    folderName: string;
    projectPath: string;
    displayName: string;
    languageName: string;
    languageCode: string;
};

function getProjectLabel(project: ProjectSwitcherItem) {
    return project.displayName || project.folderName;
}

function getProjectSubtitle(project: ProjectSwitcherItem) {
    const languageName = project.languageName || "Unknown language";
    const languageCode = project.languageCode || "und";
    return `${languageName} · ${languageCode}`;
}

interface ProjectSwitcherProps {
    openProjectsPane: () => void;
}

export function ProjectSwitcher(props: ProjectSwitcherProps) {
    const { allProjects, currentProjectRoute } = useWorkspaceContext();

    const projects = useMemo<ProjectSwitcherItem[]>(
        () =>
            [...allProjects]
                .map((item) => ({
                    folderName: item.folderName,
                    projectPath: item.projectPath,
                    displayName: item.displayName,
                    languageName: item.languageName,
                    languageCode: item.languageCode,
                }))
                .sort((a, b) => {
                    const byName = getProjectLabel(a).localeCompare(
                        getProjectLabel(b),
                    );
                    if (byName !== 0) return byName;
                    return getProjectSubtitle(a).localeCompare(
                        getProjectSubtitle(b),
                    );
                }),
        [allProjects],
    );

    const currentProject = useMemo(
        () =>
            projects.find((item) => item.folderName === currentProjectRoute) ??
            projects[0] ??
            null,
        [currentProjectRoute, projects],
    );

    if (!currentProject) {
        return (
            <div className={styles.root}>
                <button
                    type="button"
                    className={styles.trigger}
                    disabled
                    aria-label="No editable projects available"
                >
                    <div className={styles.triggerText}>
                        <span className={styles.triggerKicker}>
                            Current project
                        </span>
                        <span className={styles.triggerTitle}>No project</span>
                        <span className={styles.triggerSubtitle}>
                            No editable scripture projects
                        </span>
                    </div>
                    <span className={styles.triggerChevron}>
                        <ChevronDown size={16} />
                    </span>
                </button>
            </div>
        );
    }

    return (
        <div className={styles.root}>
            <button
                type="button"
                className={styles.trigger}
                aria-label="Browse projects"
                onClick={props.openProjectsPane}
            >
                <div className={styles.triggerText}>
                    <span className={styles.triggerKicker}>
                        Current project
                    </span>
                    <span className={styles.triggerTitle}>
                        {getProjectLabel(currentProject)}
                    </span>
                    <span className={styles.triggerSubtitle}>
                        {getProjectSubtitle(currentProject)}
                    </span>
                </div>
                <span className={styles.triggerChevron}>
                    <ChevronDown size={16} />
                </span>
            </button>
        </div>
    );
}
