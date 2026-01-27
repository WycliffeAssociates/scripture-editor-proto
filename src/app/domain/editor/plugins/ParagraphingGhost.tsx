import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ActionIcon, Button, Group, Paper, Text } from "@mantine/core";
import {
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_CRITICAL,
    KEY_ENTER_COMMAND,
    SELECTION_CHANGE_COMMAND,
} from "lexical";
import { SkipForward, Stamp, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import * as classes from "@/app/domain/editor/plugins/ParagraphingGhost.css.ts";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import {
    type Marker,
    useParagraphing,
} from "@/app/ui/contexts/ParagraphingContext.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { parseSid } from "@/core/data/bible/bible.ts";

export function ParagraphingGhost() {
    const {
        isParagraphingActive,
        currentParagraphingMarker,
        paragraphingMarkerQueue,
        currentParagraphingQueueIndex,
        skipParagraphingMarker,
        undoParagraphingMarker,
        paragraphingSnapshot,
        deactivateParagraphingMode,
    } = useParagraphing();
    const [editor] = useLexicalComposerContext();
    const { isSm, isTouch } = useWorkspaceMediaQuery();
    const { actions, project } = useWorkspaceContext();
    const [coords, setCoords] = useState<{
        top: number;
        left: number;
        // height: number;
    } | null>(null);

    useEffect(() => {
        if (!isParagraphingActive) {
            setCoords(null);
            return;
        }

        const updateGhost = () => {
            editor.getEditorState().read(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection) && selection.isCollapsed()) {
                    const nativeSelection = window.getSelection();
                    if (nativeSelection && nativeSelection.rangeCount > 0) {
                        const range = nativeSelection.getRangeAt(0);
                        let rect = range.getBoundingClientRect();

                        if (rect.width === 0 && rect.height === 0) {
                            const rects = range.getClientRects();
                            if (rects.length > 0) {
                                rect = rects[0];
                            }
                        }

                        if (rect.height > 0 || rect.top > 0) {
                            setCoords({
                                top: rect.top,
                                left: rect.left,
                                // height: rect.height || 20, // Fallback height if 0 but top/left are valid
                            });
                        }
                    }
                } else {
                    setCoords(null);
                }
            });
        };

        // Initial update
        updateGhost();

        // Listen for selection changes
        const removeListener = editor.registerCommand(
            SELECTION_CHANGE_COMMAND,
            () => {
                updateGhost();
                return false;
            },
            COMMAND_PRIORITY_CRITICAL,
        );

        // Also listen for general updates as content changes might move the caret
        const removeUpdateListener = editor.registerUpdateListener(
            ({ editorState }) => {
                editorState.read(() => {
                    updateGhost();
                });
            },
        );

        // We also need to listen to scroll/resize events to update position
        window.addEventListener("scroll", updateGhost, true);
        window.addEventListener("resize", updateGhost);

        return () => {
            removeListener();
            removeUpdateListener();
            window.removeEventListener("scroll", updateGhost, true);
            window.removeEventListener("resize", updateGhost);
        };
    }, [editor, isParagraphingActive]);

    if (!isParagraphingActive) {
        return null;
    }

    const showMobileControls = isSm || isTouch;
    const useCompactLabel = isSm || isTouch;

    const markerLabel = currentParagraphingMarker
        ? getMarkerLabel({
              marker: currentParagraphingMarker,
              useCompactLabel,
          })
        : null;

    const handleCancel = () => {
        if (paragraphingSnapshot) {
            actions.updateChapterLexical({
                fileBibleIdentifier: paragraphingSnapshot.fileBibleIdentifier,
                chap: paragraphingSnapshot.chapterNumber,
                newLexical: paragraphingSnapshot.serializedState,
                isDirty: paragraphingSnapshot.wasDirty,
            });
            actions.setEditorContent(
                paragraphingSnapshot.fileBibleIdentifier,
                paragraphingSnapshot.chapterNumber,
                undefined,
            );
        }
        deactivateParagraphingMode();
    };

    const handleSave = () => {
        const targetFile =
            paragraphingSnapshot?.fileBibleIdentifier ??
            project.pickedFile.bookCode;
        const targetChapter =
            paragraphingSnapshot?.chapterNumber ??
            project.pickedChapter?.chapNumber ??
            project.currentChapter;
        actions.saveCurrentDirtyLexical();
        actions.setEditorContent(targetFile, targetChapter, undefined);
        deactivateParagraphingMode();
    };

    return createPortal(
        <>
            {/* Ghost Marker */}
            {currentParagraphingMarker && coords && (
                <div
                    className={classes.ghostMarker}
                    style={{
                        top: coords.top,
                        left: coords.left,
                        // height: coords.height,
                    }}
                >
                    {markerLabel && (
                        <span className={classes.ghostMarkerLabel}>
                            {markerLabel}
                        </span>
                    )}
                    <span className={classes.ghostMarkerType}>
                        \{currentParagraphingMarker.type}
                    </span>
                </div>
            )}

            {/* Progress Indicator */}
            <Paper
                shadow="sm"
                p="xs"
                radius="md"
                withBorder
                className={classes.progressPanel}
            >
                <Text size="sm" fw={700} c="dimmed">
                    <Trans>Paragraphing Mode</Trans>
                </Text>
                <Text size="xs">
                    <Trans>
                        Marker {currentParagraphingQueueIndex + 1} /{" "}
                        {paragraphingMarkerQueue.length}
                    </Trans>
                </Text>
                <Group
                    gap="xs"
                    justify="flex-end"
                    className={classes.exitControls}
                >
                    <Button size="xs" variant="default" onClick={handleCancel}>
                        <Trans>Cancel</Trans>
                    </Button>
                    <Button size="xs" onClick={handleSave}>
                        <Trans>Save</Trans>
                    </Button>
                </Group>
            </Paper>

            {/* Mobile Controls */}
            {showMobileControls && (
                <Paper
                    shadow="xl"
                    p="xs"
                    radius="xl"
                    withBorder
                    className={classes.mobileControls}
                >
                    <ActionIcon
                        onClick={undoParagraphingMarker}
                        onMouseDown={(e) => e.preventDefault()}
                        variant="subtle"
                        color="gray"
                        size="lg"
                        aria-label={t`Undo`}
                    >
                        <Undo2 size={20} />
                    </ActionIcon>
                    <ActionIcon
                        onClick={() =>
                            editor.dispatchCommand(KEY_ENTER_COMMAND, null)
                        }
                        onMouseDown={(e) => e.preventDefault()}
                        variant="filled"
                        color="blue"
                        size="xl"
                        radius="xl"
                        aria-label={t`Stamp`}
                    >
                        <Stamp size={24} />
                    </ActionIcon>
                    <ActionIcon
                        onClick={skipParagraphingMarker}
                        onMouseDown={(e) => e.preventDefault()}
                        variant="subtle"
                        color="gray"
                        size="lg"
                        aria-label={t`Skip`}
                    >
                        <SkipForward size={20} />
                    </ActionIcon>
                </Paper>
            )}
        </>,
        document.body,
    );
}

function getBaseMarkerLabel(marker: string) {
    switch (marker) {
        case "v":
            return t`Verse marker`;
        case "p":
            return t`Paragraph marker`;
        case "m":
            return t`Margin paragraph`;
        case "q":
        case "q1":
        case "q2":
        case "q3":
        case "q4":
            return t`Poetry line`;
        case "s":
        case "s1":
        case "s2":
        case "s3":
        case "s4":
            return t`Section heading`;
        case "cl":
            return t`Chapter label`;
        default:
            return t`Marker`;
    }
}

function getMarkerLabel({
    marker,
    useCompactLabel,
}: {
    marker: Marker;
    useCompactLabel: boolean;
}) {
    const baseLabel = getBaseMarkerLabel(marker.type);
    if (useCompactLabel) {
        return baseLabel;
    }

    const parsedSid = marker.sid ? parseSid(marker.sid) : null;
    const verseNumber = parsedSid?.verseStart ?? marker.verse;

    // For non-verse markers, show the following text context
    const contextText =
        marker.type !== "v" && marker.contextText
            ? marker.contextText.length > 20
                ? `${marker.contextText.substring(0, 20)}...`
                : marker.contextText
            : "";

    if (marker.type === "v") {
        if (verseNumber) {
            return t`Start of verse ${verseNumber}`;
        }
        return baseLabel;
    }

    if (verseNumber) {
        if (contextText) {
            return t`${baseLabel} v${verseNumber}: "${contextText}"`;
        }
        return t`${baseLabel} v${verseNumber}`;
    }

    if (contextText) {
        return t`${baseLabel}: "${contextText}"`;
    }

    return baseLabel;
}
