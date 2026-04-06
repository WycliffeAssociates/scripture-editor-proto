import { Combobox } from "@base-ui/react/combobox";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { useRouter } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import * as selectStyles from "@/app/ui/components/primitives/Select/select.css.ts";
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

function getSearchLabel(project: ProjectSwitcherItem) {
    return [
        project.displayName,
        project.folderName,
        project.languageName,
        project.languageCode,
    ]
        .filter(Boolean)
        .join(" ");
}

export function ProjectSwitcher() {
    const router = useRouter();
    const { project, allProjects, settingsManager, currentProjectRoute } =
        useWorkspaceContext();

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

    const navigateToProject = (nextProject: ProjectSwitcherItem) => {
        if (nextProject.folderName === currentProjectRoute) {
            return;
        }

        project.updateAppSettings({
            lastProjectPath: nextProject.projectPath,
        });
        settingsManager?.update?.({
            lastProjectPath: nextProject.projectPath,
        });

        router.navigate({
            to: "/$project",
            params: { project: nextProject.folderName },
            reloadDocument: true,
        });
    };

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
            <Combobox.Root<ProjectSwitcherItem>
                items={projects}
                value={currentProject}
                onValueChange={(value) => {
                    if (value) {
                        navigateToProject(value);
                    }
                }}
                itemToStringLabel={getSearchLabel}
                itemToStringValue={(item) => item.projectPath}
            >
                <Combobox.Trigger
                    className={styles.trigger}
                    aria-label="Current project"
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
                </Combobox.Trigger>

                <Combobox.Portal>
                    <Combobox.Positioner sideOffset={8} align="start">
                        <Combobox.Popup className={styles.popup}>
                            <div className={styles.popupHeader}>
                                <div className={styles.popupTitle}>
                                    Switch project
                                </div>
                                <Combobox.Input
                                    className={styles.searchInput}
                                    aria-label="Search editable projects"
                                    placeholder="Search projects"
                                    autoFocus
                                />
                            </div>
                            <ScrollArea.Root className={styles.scrollArea}>
                                <ScrollArea.Viewport
                                    className={styles.scrollViewport}
                                >
                                    <Combobox.List className={styles.list}>
                                        {projects.map((item) => (
                                            <Combobox.Item
                                                key={item.projectPath}
                                                value={item}
                                                className={styles.item}
                                            >
                                                <Combobox.ItemIndicator
                                                    className={
                                                        selectStyles.itemIndicatorLeading
                                                    }
                                                    keepMounted
                                                >
                                                    <span
                                                        className={
                                                            selectStyles.radioCircle
                                                        }
                                                    >
                                                        <svg
                                                            className={
                                                                selectStyles.radioCheck
                                                            }
                                                            viewBox="0 0 16 16"
                                                            fill="none"
                                                            aria-hidden="true"
                                                        >
                                                            <path
                                                                d="M3.5 8.5L6.5 11.5L12.5 4.5"
                                                                stroke="currentColor"
                                                                strokeWidth="2.25"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            />
                                                        </svg>
                                                    </span>
                                                </Combobox.ItemIndicator>
                                                <div
                                                    className={
                                                        styles.itemTextBlock
                                                    }
                                                >
                                                    <span
                                                        className={
                                                            styles.itemTitle
                                                        }
                                                    >
                                                        {getProjectLabel(item)}
                                                    </span>
                                                    <span
                                                        className={
                                                            styles.itemMeta
                                                        }
                                                    >
                                                        {getProjectSubtitle(
                                                            item,
                                                        )}
                                                    </span>
                                                </div>
                                            </Combobox.Item>
                                        ))}
                                    </Combobox.List>
                                    <Combobox.Empty
                                        className={styles.emptyState}
                                    >
                                        No matching projects
                                    </Combobox.Empty>
                                </ScrollArea.Viewport>
                                <ScrollArea.Scrollbar orientation="vertical">
                                    <ScrollArea.Thumb />
                                </ScrollArea.Scrollbar>
                            </ScrollArea.Root>
                        </Combobox.Popup>
                    </Combobox.Positioner>
                </Combobox.Portal>
            </Combobox.Root>
        </div>
    );
}
