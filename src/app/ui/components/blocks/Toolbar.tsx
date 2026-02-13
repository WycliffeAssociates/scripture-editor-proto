import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Group, Loader, Menu, rem, Tooltip } from "@mantine/core";
import {
    AlignLeft,
    BookCopy,
    ChevronDown,
    FileStack,
    Menu as IconMenu,
    Lock,
    MoreHorizontal,
    Unlock,
} from "lucide-react";
import { useMemo } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { SaveAndReviewChanges } from "@/app/ui/components/blocks/DiffModal.tsx";
import { LintPopover } from "@/app/ui/components/blocks/LintPopover.tsx";
import { ReferencePicker } from "@/app/ui/components/blocks/ReferencePicker.tsx";
import { SearchInput } from "@/app/ui/components/blocks/SearchTrigger.tsx";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { HistoryButtons } from "@/app/ui/components/primitives/HistoryButton.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Toolbar.css.ts";

export function Toolbar({ openDrawer }: { openDrawer: () => void }) {
    const { actions, isProcessing, project } = useWorkspaceContext();
    const { t } = useLingui();
    const isViewOnly = (project.appSettings.editorMode ?? "regular") === "view";

    return (
        <div className={styles.toolbar}>
            <Group gap="xs" className={styles.toolbarSection}>
                <ActionIconSimple
                    data-testid={TESTING_IDS.settings.drawerOpenButton}
                    onClick={openDrawer}
                    aria-label={t`Open project drawer`}
                >
                    <IconMenu size={rem(14)} />
                </ActionIconSimple>

                <HistoryButtons />

                <Tooltip
                    label={
                        isViewOnly
                            ? t`View-only mode (click to edit)`
                            : t`Edit mode (click for view-only)`
                    }
                    withArrow
                    position="top"
                >
                    <ActionIconSimple
                        aria-label={
                            isViewOnly ? t`View-only mode` : t`Edit mode`
                        }
                        title={isViewOnly ? t`View-only mode` : t`Edit mode`}
                        className={
                            isViewOnly ? styles.viewOnlyActive : undefined
                        }
                        onClick={() =>
                            actions.setEditorMode?.(
                                isViewOnly ? "regular" : "view",
                            )
                        }
                    >
                        {isViewOnly ? (
                            <Lock size={rem(14)} />
                        ) : (
                            <Unlock size={rem(14)} />
                        )}
                    </ActionIconSimple>
                </Tooltip>

                <ReferencePicker />
                <ReferenceProjectList />
            </Group>

            <Group gap="xs" className={styles.toolbarSection}>
                <SearchInput />
                <LintPopover wrapperClassNames="relative" />
                <SaveAndReviewChanges />
                <SecondaryActionsMenu isProcessing={isProcessing} />
            </Group>
        </div>
    );
}

function SecondaryActionsMenu(props: { isProcessing: boolean }) {
    const { t } = useLingui();
    const { actions, referenceProject } = useWorkspaceContext();

    return (
        <Menu shadow="md" width={240} position="bottom-end">
            <Menu.Target>
                <Tooltip label={t`More actions`} withArrow position="top">
                    <ActionIconSimple aria-label={t`More actions`}>
                        <MoreHorizontal size={rem(14)} />
                    </ActionIconSimple>
                </Tooltip>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Label>{t`Tools`}</Menu.Label>
                <Menu.Item
                    leftSection={
                        props.isProcessing ? (
                            <Loader size={rem(14)} />
                        ) : (
                            <FileStack size={rem(14)} />
                        )
                    }
                    data-testid={TESTING_IDS.prettify.projectButton}
                    onClick={() => actions.prettifyProject()}
                    disabled={props.isProcessing}
                >
                    <Trans>Prettify Project</Trans>
                </Menu.Item>

                {referenceProject?.referenceProjectId && (
                    <>
                        <Menu.Divider />
                        <Menu.Label>{t`Match Formatting`}</Menu.Label>
                        <Menu.Item
                            leftSection={<AlignLeft size={rem(14)} />}
                            onClick={() => actions.matchFormattingChapter()}
                        >
                            <Trans>Current Chapter</Trans>
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<AlignLeft size={rem(14)} />}
                            onClick={() => actions.matchFormattingBook()}
                        >
                            <Trans>Current Book</Trans>
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<AlignLeft size={rem(14)} />}
                            onClick={() => actions.matchFormattingProject()}
                        >
                            <Trans>Entire Project</Trans>
                        </Menu.Item>
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );
}

function ReferenceProjectList() {
    const { t } = useLingui();
    const { allProjects, referenceProject, currentProjectRoute } =
        useWorkspaceContext();
    const { isSm, setMobileTab } = useWorkspaceMediaQuery();

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

    // Check if a project is the current working project
    const isCurrentProject = (project: (typeof allProjects)[0]) => {
        return (
            currentProjectRoute ===
            project.projectDirectoryPath.split("/").pop()
        );
    };

    const selected =
        allProjects.find(
            (p) =>
                p.projectDirectoryPath === referenceProject?.referenceProjectId,
        )?.name ?? t`Select Reference Project`;

    if (isSm) {
        return (
            <Menu
                shadow="md"
                width={220}
                data-testid={TESTING_IDS.referenceProjectTrigger}
            >
                <Menu.Target>
                    <ActionIconSimple
                        data-testid={TESTING_IDS.referenceProjectTrigger}
                        aria-label={t`Select reference project`}
                    >
                        <BookCopy size={16} />
                    </ActionIconSimple>
                </Menu.Target>
                <Menu.Dropdown
                    data-testid={TESTING_IDS.referenceProjectDropdown}
                    classNames={{
                        dropdown: styles.referenceDropdown,
                    }}
                >
                    <Menu.Item
                        onClick={() => {
                            referenceProject.setReferenceProjectId(undefined);
                            setMobileTab("main");
                        }}
                        data-testid={TESTING_IDS.referenceProjectClear}
                        className={styles.clearReferenceProject}
                    >
                        {t`Clear Reference Project`}
                    </Menu.Item>
                    {Object.entries(groupedProjects).map(
                        ([languageName, projects]) => (
                            <div key={languageName}>
                                <Menu.Label className={styles.languageLabel}>
                                    {languageName}
                                </Menu.Label>
                                {projects.map((project) => {
                                    const isCurrent = isCurrentProject(project);
                                    return (
                                        <Menu.Item
                                            key={project.id}
                                            onClick={() =>
                                                !isCurrent &&
                                                referenceProject.setReferenceProjectId(
                                                    project.projectDirectoryPath,
                                                )
                                            }
                                            data-testid={
                                                TESTING_IDS.referenceProjectItem
                                            }
                                            disabled={isCurrent}
                                            color={
                                                isCurrent ? "gray" : undefined
                                            }
                                            className={styles.projectItem}
                                        >
                                            <span
                                                className={
                                                    styles.projectItemContent
                                                }
                                            >
                                                {project.name}
                                                {isCurrent && (
                                                    <span
                                                        className={
                                                            styles.currentProjectIndicator
                                                        }
                                                    >
                                                        <Trans>(Current)</Trans>
                                                    </span>
                                                )}
                                            </span>
                                        </Menu.Item>
                                    );
                                })}
                            </div>
                        ),
                    )}
                </Menu.Dropdown>
            </Menu>
        );
    }

    return (
        <Menu
            shadow="md"
            width={220}
            data-testid={TESTING_IDS.referenceProjectTrigger}
        >
            <Menu.Target>
                <Button
                    variant="light"
                    rightSection={<ChevronDown size={16} />}
                    className={styles.referenceProjectButton}
                    classNames={{
                        label: styles.referenceProjectLabel,
                    }}
                >
                    {selected}
                </Button>
            </Menu.Target>
            <Menu.Dropdown
                data-testid={TESTING_IDS.referenceProjectDropdown}
                classNames={{
                    dropdown: styles.referenceDropdown,
                }}
            >
                <Menu.Item
                    onClick={() => {
                        referenceProject.setReferenceProjectId(undefined);
                        setMobileTab("main");
                    }}
                    data-testid={TESTING_IDS.referenceProjectClear}
                    className={styles.clearReferenceProject}
                >
                    <Trans>Clear Reference Project</Trans>
                </Menu.Item>
                {Object.entries(groupedProjects).map(
                    ([languageName, projects]) => (
                        <div key={languageName}>
                            <Menu.Label className={styles.languageLabel}>
                                {languageName}
                            </Menu.Label>
                            {projects.map((project) => {
                                const isCurrent = isCurrentProject(project);
                                return (
                                    <Menu.Item
                                        key={project.id}
                                        data-testid={
                                            TESTING_IDS.referenceProjectItem
                                        }
                                        onClick={() =>
                                            !isCurrent &&
                                            referenceProject.setReferenceProjectId(
                                                project.projectDirectoryPath,
                                            )
                                        }
                                        disabled={isCurrent}
                                        color={isCurrent ? "gray" : undefined}
                                        className={styles.projectItem}
                                    >
                                        <span
                                            className={
                                                styles.projectItemContent
                                            }
                                        >
                                            {project.name}
                                            {isCurrent && (
                                                <span
                                                    className={
                                                        styles.currentProjectIndicator
                                                    }
                                                >
                                                    <Trans>(Current)</Trans>
                                                </span>
                                            )}
                                        </span>
                                    </Menu.Item>
                                );
                            })}
                        </div>
                    ),
                )}
            </Menu.Dropdown>
        </Menu>
    );
}

/* FontPicker moved to ProjectSettings/FontPicker.tsx */
