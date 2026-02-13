import { Trans } from "@lingui/react/macro";
import { ActionIcon, Button, Center, Group, Stack, Text } from "@mantine/core";
import { Link, useRouter } from "@tanstack/react-router";
import { Download, Eye, Plus } from "lucide-react";
import { useMemo } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import type { ListedProject } from "@/core/persistence/ProjectRepository.ts";
import classnames from "./ProjectList.module.css.ts";

/**
 * ProjectList
 *
 * - Renders a list of projects as groups of a main project button and separate
 *   action buttons (open/export).
 * - Reads `opener` and `directoryProvider` from the router context so we can
 *   show Open / Export actions when those methods are available.
 * - No `any` usage; uses `ListedProject` and `RouterContext`.
 */
export function ProjectList() {
    const { allProjects, project, currentProjectRoute } = useWorkspaceContext();
    const router = useRouter();
    const context = router.options.context;
    const { opener, directoryProvider, platform } = context;

    // Group projects by language
    const groupedProjects = useMemo(() => {
        return allProjects.reduce(
            (acc, project) => {
                const languageName =
                    project.metadata?.language.name || "Unknown Language";
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
        router.navigate({
            to: `/$project`,
            params: { project: diskProjectName },
            reloadDocument: true,
        });
    };

    async function handleOpenProject(proj: ListedProject) {
        if (!opener || typeof opener.open !== "function") return;
        if (!directoryProvider) return;
        try {
            await opener.open(proj.projectDirectoryPath);
        } catch (err) {
            console.error("Open project failed:", err);
        }
    }

    async function handleExportProject(proj: ListedProject) {
        if (!opener || typeof opener.export !== "function") return;
        if (!directoryProvider) return;
        try {
            const dirHandle = await directoryProvider.getDirectoryHandle(
                proj.projectDirectoryPath,
            );
            await opener.export(
                dirHandle,
                `${proj.name || proj.projectDirectoryPath}.zip`,
            );
        } catch (err) {
            console.error("Export project failed:", err);
        }
    }

    return (
        <div data-testid={TESTING_IDS.appDrawer.projectsList}>
            <Stack gap={4}>
                {Object.entries(groupedProjects).map(
                    ([languageName, projects]) => (
                        <div key={languageName}>
                            <Text
                                size="xs"
                                fw={600}
                                c="dimmed"
                                className={classnames.languageLabel}
                            >
                                {languageName}
                            </Text>
                            <Stack gap={4}>
                                {projects.map((proj) => {
                                    const diskProjectName =
                                        proj.projectDirectoryPath
                                            .split("/")
                                            .pop() ?? "";
                                    const picked =
                                        diskProjectName === currentProjectRoute;
                                    return (
                                        <Group
                                            key={proj.projectDirectoryPath}
                                            justify="apart"
                                            align="center"
                                            wrap="nowrap"
                                            className={`${classnames.project} ${picked ? classnames.picked : ""}`}
                                            data-testid={
                                                TESTING_IDS.project.rowLink
                                            }
                                        >
                                            {/* Main project button that navigates to the project */}
                                            <Button
                                                variant="transparent"
                                                classNames={{
                                                    root: classnames.projectButton,
                                                }}
                                                onClick={() =>
                                                    navigateToProject(
                                                        proj.projectDirectoryPath,
                                                    )
                                                }
                                                aria-label={`Open project ${proj.name}`}
                                                style={{ background: "none" }}
                                                justify="start"
                                                data-testid={
                                                    TESTING_IDS.project
                                                        .listItemButton
                                                }
                                            >
                                                <Text
                                                    size="sm"
                                                    fw={500}
                                                    className={classnames.name}
                                                >
                                                    {proj.name}
                                                </Text>
                                            </Button>

                                            {/* Action buttons separate from the main project button */}
                                            <Group
                                                gap="xs"
                                                className={classnames.actions}
                                            >
                                                {opener &&
                                                    typeof opener.open ===
                                                        "function" &&
                                                    platform !== "android" &&
                                                    platform !== "ios" && (
                                                        <ActionIcon
                                                            size="sm"
                                                            variant="light"
                                                            aria-label={`Open in file manager ${proj.name}`}
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
                                                            <Eye />
                                                        </ActionIcon>
                                                    )}

                                                {opener &&
                                                    typeof opener.export ===
                                                        "function" && (
                                                        <ActionIcon
                                                            size="sm"
                                                            variant="light"
                                                            aria-label={`Export project ${proj.name}`}
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
                                                            <Download />
                                                        </ActionIcon>
                                                    )}
                                            </Group>
                                        </Group>
                                    );
                                })}
                            </Stack>
                        </div>
                    ),
                )}
            </Stack>

            <Center mt="xs">
                <Link to="/create" className={classnames.newProject}>
                    <Group
                        gap="xs"
                        align="center"
                        data-testid={TESTING_IDS.appDrawer.newProject}
                    >
                        <Trans>New Project</Trans>
                        <Plus />
                    </Group>
                </Link>
            </Center>
        </div>
    );
}
