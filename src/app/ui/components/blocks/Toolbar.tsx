import { Trans, useLingui } from "@lingui/react/macro";
import {
    Button,
    Group,
    Loader,
    Menu,
    Modal,
    Radio,
    rem,
    Stack,
    Text,
    Tooltip,
} from "@mantine/core";
import {
    AlignLeft,
    BookCopy,
    ChevronDown,
    Copy,
    FileStack,
    Menu as IconMenu,
    Info,
    Lock,
    MoreHorizontal,
    Unlock,
} from "lucide-react";
import { useMemo, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import {
    buildCondensedLexicalSelectionSnapshot,
    buildFullLexicalSelectionSnapshot,
} from "@/app/domain/editor/utils/debugLexicalSnapshot.ts";
import { SaveAndReviewChanges } from "@/app/ui/components/blocks/DiffModal/DiffModal.tsx";
import { LintPopover } from "@/app/ui/components/blocks/LintPopover.tsx";
import { MatchFormattingSuggestionsPanel } from "@/app/ui/components/blocks/MatchFormattingSuggestionsPanel.tsx";
import { ReferencePicker } from "@/app/ui/components/blocks/ReferencePicker.tsx";
import { SearchInput } from "@/app/ui/components/blocks/SearchTrigger.tsx";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { HistoryButtons } from "@/app/ui/components/primitives/HistoryButton.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Toolbar.css.ts";
import type {
    SkippedMarkerSuggestion,
    TargetMarkerPreservationMode,
} from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";
import type {
    ResourceLibraryGroup,
    ResourceLibraryItem,
} from "@/core/library/ProjectIndex.ts";
import { isEditableScriptureProjectLibraryItem } from "@/core/library/ProjectIndex.ts";
import { formatChapterSummary } from "@/core/persistence/gitVersionUtils.ts";

/**
 * Primary command bar for the scripture workspace route.
 *
 * This component sits one level above the editor and reference panes. It exposes
 * navigation, save/history, search, reference-item selection, and review
 * surfaces that operate on the current typed workspace and reference item.
 */
export function Toolbar({ openDrawer }: { openDrawer: () => void }) {
    const { actions, editorRef, isProcessing, project, save } =
        useWorkspaceContext();
    const { t } = useLingui();
    const isViewOnly =
        (project.appSettings.editorMode ?? EDITOR_MODES.regular) ===
        EDITOR_MODES.view;

    const copyLexicalSnapshot = async (
        scope: "context" | "full" = "context",
    ) => {
        const editor = editorRef.current;
        if (!editor) return;
        const snapshot = editor
            .getEditorState()
            .read(() =>
                scope === "full"
                    ? buildFullLexicalSelectionSnapshot()
                    : buildCondensedLexicalSelectionSnapshot(),
            );
        await navigator.clipboard.writeText(snapshot);
    };

    return (
        <>
            <div className={styles.toolbar}>
                <div className={styles.toolbarInner}>
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
                                    isViewOnly
                                        ? t`View-only mode`
                                        : t`Edit mode`
                                }
                                title={
                                    isViewOnly
                                        ? t`View-only mode`
                                        : t`Edit mode`
                                }
                                className={
                                    isViewOnly
                                        ? styles.viewOnlyActive
                                        : undefined
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
                        <ReferenceResourceList />
                        {import.meta.env.DEV && (
                            <Menu
                                shadow="md"
                                width={220}
                                position="bottom-start"
                                withinPortal={false}
                            >
                                <Menu.Target>
                                    <div>
                                        <Tooltip
                                            label="Copy lexical snapshot"
                                            withArrow
                                            position="top"
                                        >
                                            <ActionIconSimple
                                                aria-label="Copy lexical snapshot"
                                                title="Copy lexical snapshot"
                                            >
                                                <Copy size={rem(14)} />
                                            </ActionIconSimple>
                                        </Tooltip>
                                    </div>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item
                                        leftSection={<Copy size={rem(14)} />}
                                        onClick={() => {
                                            void copyLexicalSnapshot("context");
                                        }}
                                    >
                                        Copy small context
                                    </Menu.Item>
                                    <Menu.Item
                                        leftSection={<Copy size={rem(14)} />}
                                        onClick={() => {
                                            void copyLexicalSnapshot("full");
                                        }}
                                    >
                                        Copy full tree
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        )}
                    </Group>

                    <Group gap="xs" className={styles.toolbarSection}>
                        <SearchInput />
                        <LintPopover wrapperClassNames="relative" />
                        <SaveAndReviewChanges />
                        <SecondaryActionsMenu isProcessing={isProcessing} />
                        {save.versions.isViewingOlderVersion ? (
                            <Group gap={rem(4)}>
                                <Text c="orange.7" size="xs" fw={600}>
                                    <Trans>Viewing older version</Trans>
                                </Text>
                                <Button
                                    size="compact-xs"
                                    variant="light"
                                    onClick={() =>
                                        void save.versions.backToLatest(
                                            actions.saveCurrentDirtyLexical,
                                        )
                                    }
                                    data-testid={
                                        TESTING_IDS.versions.backToLatest
                                    }
                                >
                                    <Trans>Back to latest</Trans>
                                </Button>
                            </Group>
                        ) : null}
                    </Group>
                </div>
            </div>
            <MatchFormattingSuggestionsPanel
                opened={project.isFormatMatchSuggestionsOpen}
                onClose={() => project.setIsFormatMatchSuggestionsOpen(false)}
                report={project.formatMatchReport}
                autoOpen={project.autoOpenFormatMatchSuggestions}
                setAutoOpen={project.setAutoOpenFormatMatchSuggestions}
                onApplySuggestion={async (
                    suggestion: SkippedMarkerSuggestion,
                ) =>
                    (await actions.applyMatchFormattingSuggestion?.(
                        suggestion,
                    )) ?? false
                }
            />
        </>
    );
}

function SecondaryActionsMenu(props: { isProcessing: boolean }) {
    const { t } = useLingui();
    const { actions, referenceResource, project, save } = useWorkspaceContext();
    const suggestionCount = project.formatMatchReport?.suggestions.length ?? 0;
    const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
    const [scope, setScope] = useState<"chapter" | "book" | "project">(
        "chapter",
    );

    const markerModeLabel: Record<TargetMarkerPreservationMode, string> = {
        strip_all: t`Strip all target paragraph markers`,
        keep_all: t`Keep all target paragraph markers`,
        recommended: t`Recommended (keep in-verse + poetry markers)`,
    };

    const scopeLabel: Record<"chapter" | "book" | "project", string> = {
        chapter: t`Current Chapter`,
        book: t`Current Book`,
        project: t`Entire Project`,
    };

    async function runMatchFormatting() {
        if (scope === "chapter") {
            await actions.matchFormattingChapter();
        } else if (scope === "book") {
            await actions.matchFormattingBook();
        } else {
            await actions.matchFormattingProject();
        }
        setIsMatchModalOpen(false);
    }

    return (
        <>
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
                        leftSection={<BookCopy size={rem(14)} />}
                        data-testid={TESTING_IDS.versions.trigger}
                        onClick={() =>
                            void save.versions.open(
                                actions.saveCurrentDirtyLexical,
                            )
                        }
                    >
                        <Trans>Previous Versions</Trans>
                    </Menu.Item>
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
                        <Trans>Format Project</Trans>
                    </Menu.Item>

                    {referenceResource?.activeReferenceResourcePath &&
                    referenceResource.supportsScriptureNavigation ? (
                        <>
                            <Menu.Divider />
                            <Menu.Item
                                leftSection={<AlignLeft size={rem(14)} />}
                                onClick={() => setIsMatchModalOpen(true)}
                                disabled={props.isProcessing}
                            >
                                <Trans>Match Formatting...</Trans>
                            </Menu.Item>
                            {suggestionCount > 0 ? (
                                <Menu.Item
                                    leftSection={<Info size={rem(14)} />}
                                    onClick={() =>
                                        project.setIsFormatMatchSuggestionsOpen(
                                            true,
                                        )
                                    }
                                >
                                    <Trans>
                                        Review Suggestions ({suggestionCount})
                                    </Trans>
                                </Menu.Item>
                            ) : null}
                        </>
                    ) : null}
                </Menu.Dropdown>
            </Menu>

            <Modal
                opened={isMatchModalOpen}
                onClose={() => setIsMatchModalOpen(false)}
                title={t`Match Formatting`}
                centered
                size="lg"
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        <Trans>
                            Works best when your verse markers are already
                            finalized.
                        </Trans>
                    </Text>

                    <Stack gap="xs">
                        <Text fw={600} size="sm">
                            <Trans>Scope</Trans>
                        </Text>
                        <Radio.Group
                            value={scope}
                            onChange={(value) =>
                                setScope(
                                    value as "chapter" | "book" | "project",
                                )
                            }
                        >
                            <Stack gap="xs">
                                <Radio
                                    value="chapter"
                                    label={scopeLabel.chapter}
                                />
                                <Radio value="book" label={scopeLabel.book} />
                                <Radio
                                    value="project"
                                    label={scopeLabel.project}
                                />
                            </Stack>
                        </Radio.Group>
                    </Stack>

                    <Stack gap="xs">
                        <Text fw={600} size="sm">
                            <Trans>Target Marker Handling</Trans>
                        </Text>
                        <Radio.Group
                            value={project.targetMarkerPreservationMode}
                            onChange={(value) =>
                                project.setTargetMarkerPreservationMode(
                                    value as TargetMarkerPreservationMode,
                                )
                            }
                        >
                            <Stack gap="xs">
                                <Radio
                                    value="recommended"
                                    label={markerModeLabel.recommended}
                                />
                                <Radio
                                    value="keep_all"
                                    label={markerModeLabel.keep_all}
                                />
                                <Radio
                                    value="strip_all"
                                    label={markerModeLabel.strip_all}
                                />
                            </Stack>
                        </Radio.Group>
                    </Stack>

                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setIsMatchModalOpen(false)}
                        >
                            {t`Cancel`}
                        </Button>
                        <Button
                            leftSection={<AlignLeft size={rem(14)} />}
                            onClick={runMatchFormatting}
                            loading={props.isProcessing}
                        >
                            {t`Run`} {scopeLabel[scope]}
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <Modal
                opened={save.versions.isOpen}
                onClose={save.versions.close}
                title={t`Previous Versions`}
                centered
                size="lg"
            >
                <Stack
                    gap="sm"
                    data-testid={TESTING_IDS.versions.modal}
                    mah={420}
                    style={{ overflowY: "auto" }}
                >
                    {save.versions.entries.map((version) => {
                        const localizedTime = new Intl.DateTimeFormat(
                            undefined,
                            {
                                dateStyle: "medium",
                                timeStyle: "short",
                            },
                        ).format(new Date(version.authoredAtIso));
                        const summary =
                            version.chapterSummary &&
                            version.chapterSummary.length > 0
                                ? formatChapterSummary(version.chapterSummary)
                                : version.subject;
                        const isSelected =
                            save.versions.selectedHash === version.hash;
                        return (
                            <Button
                                key={version.hash}
                                variant={isSelected ? "filled" : "light"}
                                color={isSelected ? "primary.7" : "gray"}
                                justify="space-between"
                                data-testid={TESTING_IDS.versions.row}
                                h={"3rem"}
                                onClick={() =>
                                    void save.versions.select(
                                        version.hash,
                                        actions.saveCurrentDirtyLexical,
                                    )
                                }
                                styles={{
                                    inner: {
                                        alignItems: "flex-start",
                                    },
                                    label: {
                                        width: "100%",
                                        textAlign: "left",
                                    },
                                }}
                            >
                                <Stack gap={2} w="100%">
                                    <Text fw={700} size="sm">
                                        {localizedTime}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {summary}
                                    </Text>
                                </Stack>
                            </Button>
                        );
                    })}
                    {save.versions.isLoading ? <Loader size="sm" /> : null}
                    <Group justify="space-between">
                        <Button
                            variant="default"
                            onClick={() =>
                                void save.versions.backToLatest(
                                    actions.saveCurrentDirtyLexical,
                                )
                            }
                            disabled={!save.versions.isViewingOlderVersion}
                            data-testid={TESTING_IDS.versions.backToLatest}
                        >
                            <Trans>Back to latest</Trans>
                        </Button>
                        <Button
                            variant="subtle"
                            onClick={() => void save.versions.loadMore()}
                            disabled={save.versions.isLoading}
                            data-testid={TESTING_IDS.versions.loadMore}
                        >
                            <Trans>Load more</Trans>
                        </Button>
                    </Group>
                    {!save.versions.entries.length &&
                    !save.versions.isLoading ? (
                        <Text c="dimmed" size="sm">
                            <Trans>
                                Save changes to create additional versions.
                            </Trans>
                        </Text>
                    ) : null}
                </Stack>
            </Modal>

            <Modal
                opened={save.versions.dirtyPrompt.isOpen}
                onClose={save.versions.dirtyPrompt.dismiss}
                title={t`Unsaved Changes`}
                centered
                size="sm"
            >
                <Stack data-testid={TESTING_IDS.versions.dirtyPrompt}>
                    <Text size="sm">
                        <Trans>
                            You have unsaved changes. Review and save first, or
                            discard them before switching versions.
                        </Trans>
                    </Text>
                    <Group justify="flex-end">
                        <Button
                            variant="subtle"
                            onClick={save.versions.dirtyPrompt.dismiss}
                            data-testid={TESTING_IDS.versions.dirtyPromptCancel}
                        >
                            <Trans>Cancel</Trans>
                        </Button>
                        <Button
                            variant="light"
                            color="red"
                            onClick={() =>
                                void save.versions.dirtyPrompt.discardAndContinue()
                            }
                            data-testid={
                                TESTING_IDS.versions.dirtyPromptDiscard
                            }
                        >
                            <Trans>Discard</Trans>
                        </Button>
                        <Button
                            onClick={save.versions.dirtyPrompt.saveAndContinue}
                            data-testid={TESTING_IDS.versions.dirtyPromptSave}
                        >
                            <Trans>Review &amp; Save</Trans>
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}

type ReferenceResourceGroup = {
    group: ResourceLibraryGroup;
    label: string;
    languages: Array<{
        languageName: string;
        resources: ResourceLibraryItem[];
    }>;
};

const RESOURCE_GROUP_ORDER: ResourceLibraryGroup[] = [
    "scripture",
    "translation-notes",
    "translation-words",
    "other",
];

function ReferenceResourceMenuSections(props: {
    groupedResources: ReferenceResourceGroup[];
    isCurrentProject: (resource: ResourceLibraryItem) => boolean;
    setActiveReferenceResourcePath: (projectPath: string | undefined) => void;
}) {
    return props.groupedResources.map((resourceGroup) => (
        <div key={resourceGroup.group}>
            <Menu.Label className={styles.languageLabel}>
                {resourceGroup.label}
            </Menu.Label>
            {resourceGroup.languages.map(({ languageName, resources }) => (
                <div key={`${resourceGroup.group}:${languageName}`}>
                    <Menu.Label className={styles.languageLabel}>
                        {languageName}
                    </Menu.Label>
                    {resources.map((resource) => {
                        const isCurrent = props.isCurrentProject(resource);
                        return (
                            <Menu.Item
                                key={resource.folderName}
                                onClick={() =>
                                    !isCurrent &&
                                    props.setActiveReferenceResourcePath(
                                        resource.projectPath,
                                    )
                                }
                                data-testid={TESTING_IDS.referenceProjectItem}
                                disabled={isCurrent}
                                color={isCurrent ? "gray" : undefined}
                                className={styles.projectItem}
                            >
                                <span className={styles.projectItemContent}>
                                    {resource.displayName}
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
            ))}
        </div>
    ));
}

export function ReferenceResourceList() {
    const { t } = useLingui();
    const { referenceResource, currentProjectRoute } = useWorkspaceContext();
    const { isSm, setMobileTab } = useWorkspaceMediaQuery();
    const availableReferenceResources =
        referenceResource.referenceResourcesQuery.data ?? [];

    const resourceGroupLabels = useMemo<Record<ResourceLibraryGroup, string>>(
        () => ({
            scripture: t`Scripture`,
            "translation-notes": t`Translation Notes`,
            "translation-words": t`Translation Words`,
            other: t`Other Resources`,
        }),
        [t],
    );

    const groupedResources = useMemo<ReferenceResourceGroup[]>(() => {
        const resourcesByGroup = new Map<
            ResourceLibraryGroup,
            Map<string, ResourceLibraryItem[]>
        >();

        for (const resource of availableReferenceResources) {
            const group = resource.libraryGroup;
            const languageName = resource.languageName || "Unknown Language";
            const groupBucket =
                resourcesByGroup.get(group) ??
                new Map<string, ResourceLibraryItem[]>();
            const languageBucket = groupBucket.get(languageName) ?? [];
            languageBucket.push(resource);
            groupBucket.set(languageName, languageBucket);
            resourcesByGroup.set(group, groupBucket);
        }

        return RESOURCE_GROUP_ORDER.flatMap((group) => {
            const groupBucket = resourcesByGroup.get(group);
            if (!groupBucket || groupBucket.size === 0) return [];

            const languages = [...groupBucket.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([languageName, resources]) => ({
                    languageName,
                    resources: [...resources].sort((left, right) =>
                        left.displayName.localeCompare(right.displayName),
                    ),
                }));

            return [
                {
                    group,
                    label: resourceGroupLabels[group],
                    languages,
                },
            ];
        });
    }, [availableReferenceResources, resourceGroupLabels]);

    // Check if a project is the current working project
    const isCurrentProject = (
        project: (typeof availableReferenceResources)[0],
    ) => {
        return (
            isEditableScriptureProjectLibraryItem(project) &&
            currentProjectRoute === project.folderName
        );
    };

    const selected =
        availableReferenceResources.find(
            (p) =>
                p.projectPath ===
                referenceResource?.activeReferenceResourcePath,
        )?.displayName ?? t`Select Reference Resource`;

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
                        aria-label={t`Select reference resource`}
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
                            referenceResource.setActiveReferenceResourcePath(
                                undefined,
                            );
                            setMobileTab("main");
                        }}
                        data-testid={TESTING_IDS.referenceProjectClear}
                        className={styles.clearReferenceProject}
                    >
                        {t`Clear Reference Resource`}
                    </Menu.Item>
                    <ReferenceResourceMenuSections
                        groupedResources={groupedResources}
                        isCurrentProject={isCurrentProject}
                        setActiveReferenceResourcePath={
                            referenceResource.setActiveReferenceResourcePath
                        }
                    />
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
                    data-testid={TESTING_IDS.referenceProjectTrigger}
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
                        referenceResource.setActiveReferenceResourcePath(
                            undefined,
                        );
                        setMobileTab("main");
                    }}
                    data-testid={TESTING_IDS.referenceProjectClear}
                    className={styles.clearReferenceProject}
                >
                    <Trans>Clear Reference Resource</Trans>
                </Menu.Item>
                <ReferenceResourceMenuSections
                    groupedResources={groupedResources}
                    isCurrentProject={isCurrentProject}
                    setActiveReferenceResourcePath={
                        referenceResource.setActiveReferenceResourcePath
                    }
                />
            </Menu.Dropdown>
        </Menu>
    );
}

/* FontPicker moved to ProjectSettings/FontPicker.tsx */
