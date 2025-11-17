import { Trans } from "@lingui/react/macro";
import {
    ActionIcon,
    Button,
    Center,
    Grid,
    Group,
    Loader,
    Modal,
    Paper,
    rem,
    ScrollArea,
    Text,
    Tooltip,
    useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { Change } from "diff";
import { BookIcon, RotateCw, Save } from "lucide-react";
import { MEDIA_QUERY_SCREEN_SIZE } from "@/app/data/constants.ts";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import type { ProjectDiff } from "@/app/ui/hooks/useSave.tsx";

// --- NEW HELPER COMPONENT ---
type HighlightedDiffProps = {
    changes: Change[];
    viewType: "original" | "current";
};

/**
 * Renders an array of Change objects with additions/removals highlighted.
 */
function HighlightedDiffText({ changes, viewType }: HighlightedDiffProps) {
    const theme = useMantineTheme();

    const styles = {
        added: {
            backgroundColor: theme.colors.green[4],
            fontWeight: "bold",
        },
        removed: {
            backgroundColor: theme.colors.red[4],
            fontWeight: "bold",
        },
    };

    return (
        <pre
            style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}
        >
            {changes.map((change, index) => {
                let style = {};
                if (change.added && viewType === "current") {
                    style = styles.added;
                } else if (change.removed && viewType === "original") {
                    style = styles.removed;
                } else if (change.added || change.removed) {
                    // Don't render additions on the "Original" side or removals on the "Current" side
                    return null;
                }

                return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: <only id we have>
                    <span key={index} style={style}>
                        {change.value}
                    </span>
                );
            })}
        </pre>
    );
}

// Props for the new custom diff item
type DiffItemProps = {
    diff: ProjectDiff;
    revertDiff: (diffToRevert: ProjectDiff) => void;
    switchBookOrChapter: (fileBibleIdentifier: string, chapter: number) => void;
    toggleDiffModal: () => void;
};

/**
 * Renders a custom side-by-side view for a single SID change.
 */
export function DiffItem({
    diff,
    revertDiff,
    switchBookOrChapter,
    toggleDiffModal,
}: DiffItemProps) {
    const isAddition = diff.original === null;
    const isDeletion = diff.current === null;
    const isModification = !isAddition && !isDeletion;

    function scrollToClickedRef(diff: ProjectDiff) {
        switchBookOrChapter(diff.bookCode, diff.chapterNum);
        toggleDiffModal();

        setTimeout(() => {
            const domEls = [
                ...document.querySelectorAll(
                    `[data-sid="${diff.semanticSid}"]`,
                ),
            ] as HTMLElement[];
            const first = domEls[0];
            if (domEls.length > 0) {
                domEls.forEach((el) => {
                    el.style.backgroundColor = "yellow";
                });
            }
            first?.scrollIntoView({
                behavior: "smooth",
            });
            setTimeout(() => {
                if (domEls.length > 0) {
                    domEls.forEach((el) => {
                        el.style.backgroundColor = "";
                    });
                }
            }, 2000);
        }, 500);
    }

    const isSmall = useMediaQuery(MEDIA_QUERY_SCREEN_SIZE.SMALL);
    const isLarge = useMediaQuery(MEDIA_QUERY_SCREEN_SIZE.LARGE);

    return (
        <div
            style={{
                marginBottom: "1.5rem",
                border: "1px solid #dee2e6",
                borderRadius: "4px",
            }}
        >
            <Group justify="apart">
                <Text fw={500} size="sm">
                    {diff.semanticSid}
                </Text>
                {diff.detail && (
                    <Text c="orange" size="xs" fw={700}>
                        {diff.detail}
                    </Text>
                )}
            </Group>

            {isLarge ? (
                <Grid gutter="md" style={{ padding: "12px" }}>
                    {/* --- ORIGINAL (LEFT) COLUMN --- */}
                    <Grid.Col span={6}>
                        <Group justify="space-between" mb="xs">
                            <Text tt="uppercase" size="xs" fw={700}>
                                <Trans>Original</Trans>
                            </Text>
                            <Group>
                                {isSmall ? (
                                    <>
                                        <Tooltip
                                            label={
                                                <Trans>
                                                    Switch to this chapter
                                                </Trans>
                                            }
                                            withArrow
                                            position="top"
                                        >
                                            <ActionIconSimple
                                                onClick={() =>
                                                    scrollToClickedRef(diff)
                                                }
                                                aria-label="Switch to this chapter"
                                                title="Switch to this chapter"
                                            >
                                                <BookIcon size={16} />
                                            </ActionIconSimple>
                                        </Tooltip>
                                        <Tooltip
                                            label={<Trans>Revert</Trans>}
                                            withArrow
                                            position="top"
                                        >
                                            <ActionIconSimple
                                                onClick={() => revertDiff(diff)}
                                                aria-label="Revert"
                                                title="Revert"
                                            >
                                                <RotateCw size={16} />
                                            </ActionIconSimple>
                                        </Tooltip>
                                    </>
                                ) : (
                                    <>
                                        <Button
                                            variant="outline"
                                            size="compact-xs"
                                            onClick={() =>
                                                scrollToClickedRef(diff)
                                            }
                                        >
                                            <Trans>
                                                Switch to this chapter
                                            </Trans>
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="compact-xs"
                                            onClick={() => revertDiff(diff)}
                                        >
                                            <Trans>Revert</Trans>
                                        </Button>
                                    </>
                                )}
                            </Group>
                        </Group>
                        <Paper
                            withBorder
                            p="xs"
                            style={{
                                backgroundColor: isDeletion
                                    ? "#fff5f5"
                                    : "#f8f9fa", // Red background for deletions
                                minHeight: "40px",
                            }}
                        >
                            {isAddition && (
                                <Text
                                    c="dimmed"
                                    ta="center"
                                    size="sm"
                                    style={{
                                        fontStyle: "italic",
                                        paddingTop: "4px",
                                    }}
                                >
                                    <Trans>(New verse)</Trans>
                                </Text>
                            )}
                            {isDeletion && (
                                <pre
                                    style={{
                                        margin: 0,
                                        whiteSpace: "pre-wrap",
                                        fontFamily: "inherit",
                                    }}
                                >
                                    {diff.originalDisplayText}
                                </pre>
                            )}
                            {isModification && diff.wordDiff && (
                                <HighlightedDiffText
                                    changes={diff.wordDiff}
                                    viewType="original"
                                />
                            )}
                        </Paper>
                    </Grid.Col>

                    {/* --- CURRENT (RIGHT) COLUMN --- */}
                    <Grid.Col span={6}>
                        <Text tt="uppercase" size="xs" fw={700} mb="xs">
                            <Trans>Current</Trans>
                        </Text>
                        <Paper
                            withBorder
                            p="xs"
                            style={{
                                backgroundColor: isAddition
                                    ? "#e6fcf5"
                                    : "#f8f9fa", // Green background for additions
                                minHeight: "40px",
                            }}
                        >
                            {isDeletion && (
                                <Text
                                    c="dimmed"
                                    ta="center"
                                    size="sm"
                                    style={{
                                        fontStyle: "italic",
                                        paddingTop: "4px",
                                    }}
                                >
                                    <Trans>(Verse deleted)</Trans>
                                </Text>
                            )}
                            {isAddition && (
                                <pre
                                    style={{
                                        margin: 0,
                                        whiteSpace: "pre-wrap",
                                        fontFamily: "inherit",
                                    }}
                                >
                                    {diff.currentDisplayText}
                                </pre>
                            )}
                            {isModification && diff.wordDiff && (
                                <HighlightedDiffText
                                    changes={diff.wordDiff}
                                    viewType="current"
                                />
                            )}
                        </Paper>
                    </Grid.Col>
                </Grid>
            ) : (
                // Stacked vertical layout for smaller screens
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    <div>
                        <Group justify="apart" mb="xs">
                            <Text tt="uppercase" size="xs" fw={700}>
                                <Trans>Original</Trans>
                            </Text>
                            <Group>
                                <Tooltip
                                    label={
                                        <Trans>Switch to this chapter</Trans>
                                    }
                                    withArrow
                                    position="top"
                                >
                                    <ActionIconSimple
                                        onClick={() => scrollToClickedRef(diff)}
                                        aria-label="Switch to this chapter"
                                        title="Switch to this chapter"
                                    >
                                        <BookIcon size={16} />
                                    </ActionIconSimple>
                                </Tooltip>
                                <Tooltip
                                    label={<Trans>Revert</Trans>}
                                    withArrow
                                    position="top"
                                >
                                    <ActionIconSimple
                                        onClick={() => revertDiff(diff)}
                                        aria-label="Revert"
                                        title="Revert"
                                    >
                                        <RotateCw size={16} />
                                    </ActionIconSimple>
                                </Tooltip>
                            </Group>
                        </Group>
                        <Paper
                            withBorder
                            p="xs"
                            style={{
                                backgroundColor: isDeletion
                                    ? "#fff5f5"
                                    : "#f8f9fa",
                                minHeight: "40px",
                            }}
                        >
                            {isAddition && (
                                <Text
                                    c="dimmed"
                                    ta="center"
                                    size="sm"
                                    style={{
                                        fontStyle: "italic",
                                        paddingTop: "4px",
                                    }}
                                >
                                    <Trans>(New verse)</Trans>
                                </Text>
                            )}
                            {isDeletion && (
                                <pre
                                    style={{
                                        margin: 0,
                                        whiteSpace: "pre-wrap",
                                        fontFamily: "inherit",
                                    }}
                                >
                                    {diff.originalDisplayText}
                                </pre>
                            )}
                            {isModification && diff.wordDiff && (
                                <HighlightedDiffText
                                    changes={diff.wordDiff}
                                    viewType="original"
                                />
                            )}
                        </Paper>
                    </div>

                    <div>
                        <Text tt="uppercase" size="xs" fw={700} mb="xs">
                            <Trans>Current</Trans>
                        </Text>
                        <Paper
                            withBorder
                            p="xs"
                            style={{
                                backgroundColor: isAddition
                                    ? "#e6fcf5"
                                    : "#f8f9fa",
                                minHeight: "40px",
                            }}
                        >
                            {isDeletion && (
                                <Text
                                    c="dimmed"
                                    ta="center"
                                    size="sm"
                                    style={{
                                        fontStyle: "italic",
                                        paddingTop: "4px",
                                    }}
                                >
                                    <Trans>(Verse deleted)</Trans>
                                </Text>
                            )}
                            {isAddition && (
                                <pre
                                    style={{
                                        margin: 0,
                                        whiteSpace: "pre-wrap",
                                        fontFamily: "inherit",
                                    }}
                                >
                                    {diff.currentDisplayText}
                                </pre>
                            )}
                            {isModification && diff.wordDiff && (
                                <HighlightedDiffText
                                    changes={diff.wordDiff}
                                    viewType="current"
                                />
                            )}
                        </Paper>
                    </div>
                </div>
            )}
        </div>
    );
}

type DiffViewerModalProps = {
    isOpen: boolean;
    onClose: () => void;
    diffs: ProjectDiff[] | null;
    isCalculating: boolean;
    revertDiff: (diffToRevert: ProjectDiff) => void;
};

/**
 * A modal component that displays the diff results using the custom view.
 */
function DiffViewerModal({
    isOpen,
    onClose,
    diffs,
    isCalculating,
    revertDiff,
}: DiffViewerModalProps) {
    const hasChanges = diffs && diffs.length > 0;
    const { actions, saveDiff } = useWorkspaceContext();

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title="Review Changes Before Saving"
            size="95%"
            centered
        >
            <Paper
                withBorder
                p="sm"
                style={{ maxHeight: "90vh", overflow: "auto" }}
            >
                <div
                    style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 2,
                        background: "var(--mantine-color-white, #fff)",
                        padding: "0.5rem 0",
                        display: "flex",
                        justifyContent: "flex-end",
                        borderBottom:
                            "1px solid var(--mantine-color-default-border)",
                    }}
                >
                    <Button
                        variant="light"
                        size="xs"
                        onClick={saveDiff.saveProjectToDisk}
                        style={{ marginRight: "0.5rem" }}
                    >
                        <Trans>Save all changes</Trans>
                    </Button>
                </div>

                <ScrollArea style={{ height: "60vh" }}>
                    <div>
                        {isCalculating && (
                            <Center style={{ height: "100%" }}>
                                <Loader />
                            </Center>
                        )}

                        {!isCalculating && !hasChanges && (
                            <Center style={{ height: "100%" }}>
                                <Text>
                                    <Trans>No changes detected.</Trans>
                                </Text>
                            </Center>
                        )}

                        {!isCalculating && hasChanges && (
                            <div>
                                {diffs.map((diff) => (
                                    <DiffItem
                                        key={diff.semanticSid}
                                        diff={diff}
                                        revertDiff={revertDiff}
                                        switchBookOrChapter={
                                            actions.switchBookOrChapter
                                        }
                                        toggleDiffModal={
                                            actions.toggleDiffModal
                                        }
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </Paper>
        </Modal>
    );
}

/**
 * Example parent component demonstrating the usage of the hook and modal.
 */
/**
 * Example parent component demonstrating the usage of the hook and modal.
 */
export function SaveAndReviewChanges() {
    const { saveDiff, actions } = useWorkspaceContext();
    const isSmall = useMediaQuery(MEDIA_QUERY_SCREEN_SIZE.SMALL);

    return (
        <>
            <DiffViewerModal
                isOpen={saveDiff.openDiffModal}
                onClose={saveDiff.closeModal}
                diffs={saveDiff.diffs}
                isCalculating={false}
                revertDiff={saveDiff.handleRevert}
            />

            {isSmall ? (
                <Tooltip
                    label={<Trans>Review and save changes</Trans>}
                    withArrow
                    position="top"
                >
                    <ActionIconSimple
                        onClick={actions.toggleDiffModal}
                        aria-label="Review and save changes"
                        title="Review and save changes"
                    >
                        <Save size={16} />
                    </ActionIconSimple>
                </Tooltip>
            ) : (
                <Button onClick={actions.toggleDiffModal}>
                    <Trans>Review &amp; Save</Trans>
                </Button>
            )}
        </>
    );
}
