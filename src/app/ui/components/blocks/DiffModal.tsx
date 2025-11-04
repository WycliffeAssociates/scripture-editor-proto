import {
    Button,
    Center,
    Grid,
    Loader,
    Modal,
    Paper,
    ScrollArea,
    Text,
} from "@mantine/core";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext";
import type { ProjectDiff } from "./hooks/useProjectDiffs"; // Adjust import path

// Props for the new custom diff item
type DiffItemProps = {
    diff: ProjectDiff;
};

/**
 * Renders a custom side-by-side view for a single SID change.
 */
function DiffItem({ diff }: DiffItemProps) {
    const isAddition = diff.original === null;
    const isDeletion = diff.current === null;

    return (
        <div
            style={{
                marginBottom: "1.5rem",
                border: "1px solid #dee2e6",
                borderRadius: "4px",
            }}
        >
            <Text
                fw={500}
                size="sm"
                style={{
                    padding: "8px 12px",
                    backgroundColor: "#f8f9fa",
                    borderBottom: "1px solid #dee2e6",
                }}
            >
                {diff.sid}
            </Text>
            <Grid gutter="md" style={{ padding: "12px" }}>
                <Grid.Col span={6}>
                    <Text size="xs" tt="uppercase" fw={700}>
                        Original
                    </Text>
                    <Paper
                        withBorder
                        p="xs"
                        mt="xs"
                        style={{
                            backgroundColor: isDeletion ? "#fff5f5" : "#f8f9fa",
                            minHeight: "40px",
                        }}
                    >
                        {isAddition ? (
                            <Text
                                ta="center"
                                size="sm"
                                style={{
                                    fontStyle: "italic",
                                    paddingTop: "4px",
                                }}
                            >
                                (New verse)
                            </Text>
                        ) : (
                            <pre
                                style={{
                                    margin: 0,
                                    whiteSpace: "pre-wrap",
                                    fontFamily: "inherit",
                                }}
                            >
                                {diff.original}
                            </pre>
                        )}
                    </Paper>
                </Grid.Col>
                <Grid.Col span={6}>
                    <Text size="xs" tt="uppercase" fw={700}>
                        Current
                    </Text>
                    <Paper
                        withBorder
                        p="xs"
                        mt="xs"
                        style={{
                            backgroundColor: isAddition ? "#e6fcf5" : "#f8f9fa",
                            minHeight: "40px",
                        }}
                    >
                        {isDeletion ? (
                            <Text
                                ta="center"
                                size="sm"
                                style={{
                                    fontStyle: "italic",
                                    paddingTop: "4px",
                                }}
                            >
                                (Verse deleted)
                            </Text>
                        ) : (
                            <pre
                                style={{
                                    margin: 0,
                                    whiteSpace: "pre-wrap",
                                    fontFamily: "inherit",
                                }}
                            >
                                {diff.current}
                            </pre>
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
};

/**
 * A modal component that displays the diff results using the custom view.
 */
function DiffViewerModal({
    isOpen,
    onClose,
    diffs,
    isCalculating,
}: DiffViewerModalProps) {
    const hasChanges = diffs && diffs.length > 0;

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title="Review Changes Before Saving"
            size="90%"
            centered
        >
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
                            <DiffItem key={diff.sid} diff={diff} />
                        ))}
                    </div>
                )}
            </ScrollArea>
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
    const { saveDiff } = useWorkspaceContext();
    return (
        <>
            <DiffViewerModal
                isOpen={saveDiff.openDiffModal}
                onClose={saveDiff.closeModal}
                diffs={saveDiff.diffs}
                isCalculating={saveDiff.isCalculating}
            />

            <Button onClick={saveDiff.toggleDiffModal}>Review & Save</Button>
        </>
    );
}
