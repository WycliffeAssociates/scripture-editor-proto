import {
    Button,
    Center,
    Grid,
    Group,
    Loader,
    Modal,
    Paper,
    ScrollArea,
    Text,
    useMantineTheme,
} from "@mantine/core";
import type { Change } from "diff";
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

            <Grid gutter="md" style={{ padding: "12px" }}>
                {/* --- ORIGINAL (LEFT) COLUMN --- */}
                <Grid.Col span={6}>
                    <Group justify="space-between" mb="xs">
                        <Text tt="uppercase" size="xs" fw={700}>
                            Original
                        </Text>
                        <Group>
                            <Button
                                variant="outline"
                                size="compact-xs"
                                onClick={() => scrollToClickedRef(diff)}
                            >
                                Switch to this chapter
                            </Button>
                            <Button
                                variant="outline"
                                size="compact-xs"
                                onClick={() => revertDiff(diff)}
                            >
                                Revert
                            </Button>
                        </Group>
                    </Group>
                    <Paper
                        withBorder
                        p="xs"
                        style={{
                            backgroundColor: isDeletion ? "#fff5f5" : "#f8f9fa", // Red background for deletions
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
                                (New verse)
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
                        Current
                    </Text>
                    <Paper
                        withBorder
                        p="xs"
                        style={{
                            backgroundColor: isAddition ? "#e6fcf5" : "#f8f9fa", // Green background for additions
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
                                (Verse deleted)
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
            size="90%"
            centered
        >
            <Paper withBorder p="md">
                <Button
                    variant="light"
                    size="xs"
                    onClick={saveDiff.saveProjectToDisk}
                    style={{ marginLeft: "auto", marginBottom: "1rem" }}
                >
                    Save all changes
                </Button>

                <ScrollArea style={{ height: "70vh" }}>
                    {isCalculating && (
                        <Center style={{ height: "100%" }}>
                            <Loader />
                        </Center>
                    )}

                    {!isCalculating && !hasChanges && (
                        <Center style={{ height: "100%" }}>
                            <Text>No changes detected.</Text>
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
                                    toggleDiffModal={actions.toggleDiffModal}
                                />
                            ))}
                        </div>
                    )}
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
    return (
        <>
            <DiffViewerModal
                isOpen={saveDiff.openDiffModal}
                onClose={saveDiff.closeModal}
                diffs={saveDiff.diffs}
                isCalculating={false}
                revertDiff={saveDiff.handleRevert}
            />

            <Button onClick={actions.toggleDiffModal}>Review & Save</Button>
        </>
    );
}
