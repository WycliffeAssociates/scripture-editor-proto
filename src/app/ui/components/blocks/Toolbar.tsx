import { Trans, useLingui } from "@lingui/react/macro";
import {
    Button,
    Group,
    Loader,
    Menu,
    Modal,
    rem,
    Text,
    Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
    AlignLeft,
    BookCopy,
    ChevronDown,
    FileStack,
    Menu as IconMenu,
    Stamp,
} from "lucide-react";
import { useMemo } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import {
    extractMarkersFromUsfmString,
    stripMarkersFromSerialized,
} from "@/app/domain/editor/utils/paragraphingUtils.ts";
import { SaveAndReviewChanges } from "@/app/ui/components/blocks/DiffModal.tsx";
import { ReferencePicker } from "@/app/ui/components/blocks/ReferencePicker.tsx";
import { SearchInput } from "@/app/ui/components/blocks/SearchTrigger.tsx";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { HistoryButtons } from "@/app/ui/components/primitives/HistoryButton.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useParagraphing } from "@/app/ui/contexts/ParagraphingContext.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as classes from "@/app/ui/styles/modules/Toolbar.css.ts";

export function Toolbar({ openDrawer }: { openDrawer: () => void }) {
    const { actions, isProcessing } = useWorkspaceContext();
    const { t } = useLingui();

    return (
        <Group className={classes.toolbar}>
            <ActionIconSimple
                data-testid={TESTING_IDS.settings.drawerOpenButton}
                onClick={openDrawer}
                aria-label="Open project drawer"
            >
                <IconMenu size={rem(14)} />
            </ActionIconSimple>

            {/* Undo / Redo */}
            <HistoryButtons />

            <ReferencePicker />

            {/* Keep reference project selector visible */}
            <ReferenceProjectList />

            {/* Search and save remain in toolbar */}
            <SearchInput />

            {/* Match Formatting Menu */}
            <MatchFormattingMenu />

            <Tooltip label={t`Prettify Project`} withArrow position="top">
                <ActionIconSimple
                    data-testid={TESTING_IDS.prettify.projectButton}
                    onClick={() => actions.prettifyProject()}
                    aria-label={t`Prettify Project`}
                    disabled={isProcessing}
                >
                    {isProcessing ? (
                        <Loader size={rem(14)} />
                    ) : (
                        <FileStack size={rem(14)} />
                    )}
                </ActionIconSimple>
            </Tooltip>

            <ParagraphingToggle />

            <SaveAndReviewChanges />
        </Group>
    );
}

function ParagraphingToggle() {
    const { t } = useLingui();
    const { isActive, activate, deactivate } = useParagraphing();
    const { referenceProject, project, editorRef, isProcessing } =
        useWorkspaceContext();
    const [opened, { open, close }] = useDisclosure(false);

    const handleClick = () => {
        if (isActive) {
            deactivate();
        } else {
            open();
        }
    };

    const handleActivate = async (cleanSlate: boolean) => {
        const loadedProject =
            referenceProject.referenceQuery.data?.loadedProject;
        if (!loadedProject) {
            notifications.show({
                title: t`Error`,
                message: t`Please select a reference project first.`,
                color: "red",
            });
            close();
            return;
        }

        const currentBookCode = project.pickedFile.bookCode;
        const usfm = await loadedProject.getBook(currentBookCode);

        if (!usfm) {
            notifications.show({
                title: t`Error`,
                message: t`Could not load reference book content.`,
                color: "red",
            });
            close();
            return;
        }

        const markers = extractMarkersFromUsfmString(usfm);

        if (cleanSlate && editorRef.current) {
            const editor = editorRef.current;
            const currentEditorState = editor.getEditorState();
            const serialized = currentEditorState.toJSON();
            const cleanedChildren = stripMarkersFromSerialized(
                serialized.root.children,
            );

            const newSerialized = {
                ...serialized,
                root: {
                    ...serialized.root,
                    children: cleanedChildren,
                },
            };

            const newState = editor.parseEditorState(newSerialized);
            editor.setEditorState(newState);
        }

        activate(markers);
        close();
    };

    return (
        <>
            <Tooltip label={t`Paragraphing Mode`} withArrow position="top">
                <ActionIconSimple
                    onClick={handleClick}
                    aria-label={t`Paragraphing Mode`}
                    variant={isActive ? "filled" : "subtle"}
                    disabled={isProcessing}
                >
                    <Stamp size={rem(14)} />
                </ActionIconSimple>
            </Tooltip>

            <Modal
                opened={opened}
                onClose={close}
                title={t`Enter Paragraphing Mode`}
            >
                <Text size="sm" mb="lg">
                    <Trans>
                        This mode allows you to apply formatting from the
                        reference text. Do you want to strip existing formatting
                        (Clean Slate) or keep it?
                    </Trans>
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={close}>
                        <Trans>Cancel</Trans>
                    </Button>
                    <Button
                        variant="light"
                        onClick={() => handleActivate(false)}
                    >
                        <Trans>Keep Formatting</Trans>
                    </Button>
                    <Button color="red" onClick={() => handleActivate(true)}>
                        <Trans>Clean Slate</Trans>
                    </Button>
                </Group>
            </Modal>
        </>
    );
}

/* ---------------- Reference Project ---------------- */
function MatchFormattingMenu() {
    const { t } = useLingui();
    const { actions, referenceProject } = useWorkspaceContext();

    if (!referenceProject?.referenceProjectId) return null;

    return (
        <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
                <Tooltip
                    label={t`Match Formatting to Source`}
                    withArrow
                    position="top"
                >
                    <ActionIconSimple
                        aria-label={t`Match Formatting to Source`}
                    >
                        <AlignLeft size={rem(14)} />
                    </ActionIconSimple>
                </Tooltip>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Label>{t`Match Formatting to Source`}</Menu.Label>
                <Menu.Item onClick={() => actions.matchFormattingChapter()}>
                    <Trans>Current Chapter</Trans>
                </Menu.Item>
                <Menu.Item onClick={() => actions.matchFormattingBook()}>
                    <Trans>Current Book</Trans>
                </Menu.Item>
                <Menu.Item onClick={() => actions.matchFormattingProject()}>
                    <Trans>Entire Project</Trans>
                </Menu.Item>
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
        allProjects.find((p) => p.id === referenceProject?.referenceProjectId)
            ?.name ?? t`Select Reference Project`;

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
                >
                    <Menu.Item
                        onClick={() => {
                            referenceProject.setReferenceProjectId(undefined);
                            setMobileTab("main");
                        }}
                        data-testid={TESTING_IDS.referenceProjectClear}
                        className={classes.clearReferenceProject}
                    >
                        {t`Clear Reference Project`}
                    </Menu.Item>
                    {Object.entries(groupedProjects).map(
                        ([languageName, projects]) => (
                            <div key={languageName}>
                                <Menu.Label className={classes.languageLabel}>
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
                                            className={classes.projectItem}
                                        >
                                            <span
                                                className={
                                                    classes.projectItemContent
                                                }
                                            >
                                                {project.name}
                                                {isCurrent && (
                                                    <span
                                                        className={
                                                            classes.currentProjectIndicator
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
                >
                    {selected}
                </Button>
            </Menu.Target>
            <Menu.Dropdown data-testid={TESTING_IDS.referenceProjectDropdown}>
                <Menu.Item
                    onClick={() => {
                        referenceProject.setReferenceProjectId(undefined);
                        setMobileTab("main");
                    }}
                    data-testid={TESTING_IDS.referenceProjectClear}
                    className={classes.clearReferenceProject}
                >
                    <Trans>Clear Reference Project</Trans>
                </Menu.Item>
                {Object.entries(groupedProjects).map(
                    ([languageName, projects]) => (
                        <div key={languageName}>
                            <Menu.Label className={classes.languageLabel}>
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
                                        className={classes.projectItem}
                                    >
                                        <span
                                            className={
                                                classes.projectItemContent
                                            }
                                        >
                                            {project.name}
                                            {isCurrent && (
                                                <span
                                                    className={
                                                        classes.currentProjectIndicator
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
