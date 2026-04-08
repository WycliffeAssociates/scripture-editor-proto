import { Trans } from "@lingui/react/macro";
import { Link, useRouter } from "@tanstack/react-router";
import { Download, Eye, Plus } from "lucide-react";
import { useMemo } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon/ActionIcon.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { vars } from "@/app/ui/styles/designSystem.css.ts";
import type { ProjectListItem } from "@/core/persistence/ScriptureWorkspace.ts";
import classnames from "./ProjectList.module.css.ts";

/**
 * Drawer list of editable scripture items.
 *
 * The broader library index can hold many item types, but this list is
 * intentionally biased toward the current "editable scripture workspace" story:
 * open it, reveal it on disk, or export its managed-storage tree.
 */
export function ProjectList() {
    const { allProjects, project, currentProjectRoute, settingsManager } =
        useWorkspaceContext();
    const router = useRouter();
    const context = router.options.context;
    const { opener, platform } = context;

    const groupedProjects = useMemo(() => {
        return allProjects.reduce(
            (acc, project) => {
                const languageName = project.languageName || "Unknown Language";
                if (!acc[languageName]) {
                    acc[languageName] = [];
                }
                acc[languageName].push(project);
                return acc;
            },
            {} as Record<string, typeof allProjects>,
        );
    }, [allProjects]);

    const navigateToProject = (projectPath: string) => {
        const diskProjectName = projectPath.split("/").pop();
        if (!diskProjectName) {
            throw new Error("Invalid project path");
        }
        project.updateAppSettings({
            lastProjectPath: projectPath,
        });
        settingsManager?.update?.({
            lastProjectPath: projectPath,
        });
        router.navigate({
            to: `/$project`,
            params: { project: diskProjectName },
            reloadDocument: true,
        });
    };

    async function handleOpenProject(proj: ProjectListItem) {
        if (!opener || typeof opener.open !== "function") return;
        try {
            await opener.open(proj.projectPath);
        } catch (err) {
            console.error("Open project failed:", err);
        }
    }

    async function handleExportProject(proj: ProjectListItem) {
        if (!opener || typeof opener.export !== "function") return;
        try {
            await opener.export(
                proj.projectPath,
                `${proj.displayName || proj.folderName}.zip`,
            );
        } catch (err) {
            console.error("Export project failed:", err);
        }
    }

    return (
        <div data-testid={TESTING_IDS.appDrawer.projectsList}>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                }}
            >
                {Object.entries(groupedProjects).map(
                    ([languageName, projects]) => (
                        <div key={languageName}>
                            <span
                                style={{
                                    fontSize:
                                        vars.typography.bodySmallest.fontSize,
                                    fontWeight: 600,
                                    color: vars.color.onSurfaceTertiary,
                                }}
                                className={classnames.languageLabel}
                            >
                                {languageName}
                            </span>
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.25rem",
                                }}
                            >
                                {projects.map((proj) => {
                                    const diskProjectName = proj.folderName;
                                    const picked =
                                        diskProjectName === currentProjectRoute;
                                    return (
                                        <div
                                            key={proj.folderName}
                                            className={`${classnames.project} ${picked ? classnames.picked : ""}`}
                                            data-testid={
                                                TESTING_IDS.project.rowLink
                                            }
                                        >
                                            <Button
                                                variant="tertiary"
                                                className={
                                                    classnames.projectButton
                                                }
                                                onClick={() =>
                                                    navigateToProject(
                                                        proj.projectPath,
                                                    )
                                                }
                                                aria-label={`Open project ${proj.displayName}`}
                                                data-testid={
                                                    TESTING_IDS.project
                                                        .listItemButton
                                                }
                                            >
                                                <span
                                                    style={{
                                                        fontSize:
                                                            vars.typography
                                                                .bodySmall
                                                                .fontSize,
                                                        fontWeight: 500,
                                                    }}
                                                    className={classnames.name}
                                                >
                                                    {proj.displayName}
                                                </span>
                                            </Button>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: "0.5rem",
                                                    alignItems: "center",
                                                }}
                                                className={classnames.actions}
                                            >
                                                {opener &&
                                                    typeof opener.open ===
                                                        "function" &&
                                                    platform !== "android" &&
                                                    platform !== "ios" && (
                                                        <ActionIconSimple
                                                            aria-label={`Open in file manager ${proj.displayName}`}
                                                            onClick={(
                                                                e: React.MouseEvent,
                                                            ) => {
                                                                e.stopPropagation();
                                                                handleOpenProject(
                                                                    proj,
                                                                );
                                                            }}
                                                            className={
                                                                classnames.iconButton
                                                            }
                                                            data-testid={
                                                                TESTING_IDS
                                                                    .appDrawer
                                                                    .itemOpen
                                                            }
                                                        >
                                                            <Eye size={16} />
                                                        </ActionIconSimple>
                                                    )}

                                                {opener &&
                                                    typeof opener.export ===
                                                        "function" && (
                                                        <ActionIconSimple
                                                            aria-label={`Export project ${proj.displayName}`}
                                                            onClick={(
                                                                e: React.MouseEvent,
                                                            ) => {
                                                                e.stopPropagation();
                                                                handleExportProject(
                                                                    proj,
                                                                );
                                                            }}
                                                            className={
                                                                classnames.iconButton
                                                            }
                                                            data-testid={
                                                                TESTING_IDS
                                                                    .appDrawer
                                                                    .itemExport
                                                            }
                                                        >
                                                            <Download
                                                                size={16}
                                                            />
                                                        </ActionIconSimple>
                                                    )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ),
                )}
            </div>

            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: "0.5rem",
                }}
            >
                <Link to="/create" className={classnames.newProject}>
                    <div
                        style={{
                            display: "flex",
                            gap: "0.5rem",
                            alignItems: "center",
                        }}
                        data-testid={TESTING_IDS.appDrawer.newProject}
                    >
                        <Trans>New Project</Trans>
                        <Plus size={16} />
                    </div>
                </Link>
            </div>
        </div>
    );
}
