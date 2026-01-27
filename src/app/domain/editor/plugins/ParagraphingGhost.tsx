import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ActionIcon, Paper, rem, Text } from "@mantine/core";
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
import { useWorkspaceMediaQuery } from "../../../ui/contexts/MediaQuery.tsx";
import { useParagraphing } from "../../../ui/contexts/ParagraphingContext.tsx";

export function ParagraphingGhost() {
    const { isActive, currentMarker, queue, currentIndex, skip, undo } =
        useParagraphing();
    const [editor] = useLexicalComposerContext();
    const { isSm, isTouch } = useWorkspaceMediaQuery();
    const [coords, setCoords] = useState<{
        top: number;
        left: number;
        height: number;
    } | null>(null);

    useEffect(() => {
        if (!isActive) {
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
                                height: rect.height || 20, // Fallback height if 0 but top/left are valid
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
    }, [editor, isActive]);

    if (!isActive) {
        return null;
    }

    const showMobileControls = isSm || isTouch;

    return createPortal(
        <>
            {/* Ghost Marker */}
            {currentMarker && coords && (
                <div
                    style={{
                        position: "fixed",
                        top: coords.top,
                        left: coords.left,
                        height: coords.height,
                        pointerEvents: "none",
                        zIndex: 9999,
                        opacity: 0.6,
                        display: "flex",
                        alignItems: "center",
                        marginLeft: "1px", // Slight offset
                        color: "var(--mantine-color-blue-6)", // Use mantine var if available, else fallback
                        fontFamily: "monospace",
                        fontSize: "1rem",
                        whiteSpace: "nowrap",
                        backgroundColor: "rgba(255, 255, 255, 0.8)", // Background to make it readable over text
                        borderRadius: "4px",
                        padding: "0 4px",
                        boxShadow: "0 0 4px rgba(0,0,0,0.1)",
                        transform: "translateY(-100%)", // Move it above the line so it doesn't obscure the text being typed?
                        marginTop: "-4px",
                    }}
                >
                    <span style={{ fontWeight: "bold" }}>
                        {currentMarker.type}
                    </span>
                    {currentMarker.verse && (
                        <span
                            style={{
                                fontSize: "0.8em",
                                marginLeft: "4px",
                                color: "#666",
                            }}
                        >
                            {currentMarker.verse}
                        </span>
                    )}
                </div>
            )}

            {/* Progress Indicator */}
            <Paper
                shadow="sm"
                p="xs"
                radius="md"
                withBorder
                style={{
                    position: "fixed",
                    top: rem(80),
                    right: rem(16),
                    zIndex: 9990,
                    opacity: 0.9,
                    pointerEvents: "none",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                }}
            >
                <Text size="sm" fw={700} c="dimmed">
                    Paragraphing Mode
                </Text>
                <Text size="xs">
                    Marker {currentIndex + 1} / {queue.length}
                </Text>
                {currentMarker && (
                    <Text size="xs" c="blue" fw={500}>
                        Next: \{currentMarker.type}
                    </Text>
                )}
            </Paper>

            {/* Mobile Controls */}
            {showMobileControls && (
                <Paper
                    shadow="xl"
                    p="xs"
                    radius="xl"
                    withBorder
                    style={{
                        position: "fixed",
                        bottom: rem(32),
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 9999,
                        display: "flex",
                        gap: rem(16),
                        alignItems: "center",
                    }}
                >
                    <ActionIcon
                        onClick={undo}
                        onMouseDown={(e) => e.preventDefault()}
                        variant="subtle"
                        color="gray"
                        size="lg"
                        aria-label="Undo"
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
                        aria-label="Stamp"
                    >
                        <Stamp size={24} />
                    </ActionIcon>
                    <ActionIcon
                        onClick={skip}
                        onMouseDown={(e) => e.preventDefault()}
                        variant="subtle"
                        color="gray"
                        size="lg"
                        aria-label="Skip"
                    >
                        <SkipForward size={20} />
                    </ActionIcon>
                </Paper>
            )}
        </>,
        document.body,
    );
}
