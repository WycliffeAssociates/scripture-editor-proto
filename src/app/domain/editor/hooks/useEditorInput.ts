import {
    $createLineBreakNode,
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_HIGH,
    KEY_BACKSPACE_COMMAND,
    KEY_DOWN_COMMAND,
    KEY_ENTER_COMMAND,
    type LexicalEditor,
    type LexicalNode,
} from "lexical";
import { useEffect } from "react";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    handleBackslashOnStartOfVerse,
    handleEnterOnStartOfVerse,
    moveCaretIntoStructuralEmptyParagraphOnArrow,
    moveToAdjacentNodesWhenSeemsAppropriate,
} from "@/app/domain/editor/listeners/editorQualityOfLife.ts";
import {
    inverseTextNodeTransform,
    textNodeTransform,
} from "@/app/domain/editor/listeners/manageUsfmMarkers.ts";
import { redirectParaInsertionToLineBreak } from "@/app/domain/editor/listeners/useLineBreaksNotParas.ts";
import {
    $createUSFMParagraphNode,
    $isUSFMParagraphNode,
} from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { calculateIsStartOfLine } from "@/app/domain/editor/utils/nodePositionUtils.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { isValidParaMarker } from "@/core/data/usfm/tokens.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

/**
 * Hook that registers all editor input handling including:
 * - Node transforms for USFMTextNode
 * - Paragraph to line break redirection
 * - Command handlers for keydown, paste, and cut operations
 *
 * @param editor - The LexicalEditor instance
 */
export function useEditorInput(editor: LexicalEditor) {
    const { project, projectLanguageDirection, search } = useWorkspaceContext();
    const { appSettings } = project;
    const editorModeSetting = appSettings.editorMode ?? "regular";

    useEffect(() => {
        // Register USFMTextNode transform
        const unregisterTransformWhileTyping = editor.registerNodeTransform(
            USFMTextNode,
            (node) => {
                const arg = {
                    node,
                    editor,
                    editorMode: editorModeSetting,
                    languageDirection: projectLanguageDirection,
                };
                textNodeTransform(arg);
                inverseTextNodeTransform(arg);
            },
        );

        // Redirect paragraph insertion to line break
        const redirectParaInsertionToLineBreakUnregister =
            redirectParaInsertionToLineBreak(editor);

        // Register KEY_DOWN_COMMAND for moving to adjacent nodes
        const moveToAdjacentNodesUnregister = editor.registerCommand(
            KEY_DOWN_COMMAND,
            (event: KeyboardEvent) => {
                return moveToAdjacentNodesWhenSeemsAppropriate(editor, event);
            },
            COMMAND_PRIORITY_HIGH,
        );

        const removeStructuralEmptyParaOnBackspaceUnregister =
            editor.registerCommand(
                KEY_BACKSPACE_COMMAND,
                (event: KeyboardEvent) => {
                    if (editorModeSetting !== "regular") return false;
                    const selection = $getSelection();
                    if (
                        !$isRangeSelection(selection) ||
                        !selection.isCollapsed()
                    ) {
                        return false;
                    }

                    const anchorNode = selection.anchor.getNode();
                    const anchorOffset = selection.anchor.offset;
                    if (!$isUSFMTextNode(anchorNode)) return false;

                    const { isStartOfLine } = calculateIsStartOfLine(
                        anchorNode,
                        anchorOffset,
                        { editor, editorMode: editorModeSetting },
                    );
                    if (!isStartOfLine) return false;

                    let parent = anchorNode.getParent();
                    while (parent && !$isUSFMParagraphNode(parent)) {
                        parent = parent.getParent();
                    }
                    if (!parent || !$isUSFMParagraphNode(parent)) return false;

                    const prevPara = parent.getPreviousSibling();
                    if (!prevPara || !$isUSFMParagraphNode(prevPara)) {
                        return false;
                    }

                    // A paragraph marker line is "structural-empty" if it has no meaningful content,
                    // ignoring placeholder whitespace-only text nodes.
                    const isStructuralEmpty = () => {
                        const children = prevPara.getChildren();
                        if (children.length === 0) return true;
                        for (const child of children) {
                            if (child.getType() === "linebreak") {
                                continue;
                            }
                            if (!$isUSFMTextNode(child)) {
                                return false;
                            }
                            const tt = child.getTokenType();
                            if (tt !== UsfmTokenTypes.text) {
                                return false;
                            }
                            if (child.getTextContent().trim().length > 0) {
                                return false;
                            }
                        }
                        return true;
                    };

                    if (!isStructuralEmpty()) {
                        return false;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    editor.update(() => {
                        prevPara.remove();
                    });
                    return true;
                },
                COMMAND_PRIORITY_HIGH,
            );

        const insertParagraphAfterStructuralEmptyMarkerUnregister =
            editor.registerCommand(
                KEY_ENTER_COMMAND,
                (event: KeyboardEvent) => {
                    if (editorModeSetting !== "regular") return false;

                    const selection = $getSelection();
                    if (
                        !$isRangeSelection(selection) ||
                        !selection.isCollapsed()
                    ) {
                        return false;
                    }

                    const anchorNode = selection.anchor.getNode();

                    // Allow Enter handling even when the caret lands on a linebreak or other
                    // non-text node inside an otherwise-empty structural marker paragraph.
                    let parent: LexicalNode | null = anchorNode;
                    while (parent && !$isUSFMParagraphNode(parent)) {
                        parent = parent.getParent();
                    }
                    if (!parent || !$isUSFMParagraphNode(parent)) return false;
                    if (!parent.getIsStructuralEmpty()) return false;

                    event.preventDefault();
                    event.stopPropagation();

                    editor.update(() => {
                        // Heuristic: use the nearest previous para marker that isn't a heading;
                        // otherwise fall back to \p.
                        const nextMarker = (() => {
                            let prev = parent.getPreviousSibling();
                            while (prev && $isUSFMParagraphNode(prev)) {
                                const m = prev.getMarker();
                                if (
                                    m &&
                                    isValidParaMarker(m) &&
                                    m !== "b" &&
                                    !m.startsWith("s")
                                ) {
                                    return m;
                                }
                                prev = prev.getPreviousSibling();
                            }
                            return "p";
                        })();

                        const newPara = $createUSFMParagraphNode({
                            id: guidGenerator(),
                            marker: nextMarker,
                            tokenType: UsfmTokenTypes.marker,
                        });

                        const placeholder = $createUSFMTextNode(" ", {
                            id: guidGenerator(),
                            tokenType: UsfmTokenTypes.text,
                            sid: parent.getSid(),
                            inPara: nextMarker,
                        });

                        newPara.append(placeholder);
                        newPara.append($createLineBreakNode());
                        parent.insertAfter(newPara);
                        placeholder.selectStart();
                    });

                    return true;
                },
                COMMAND_PRIORITY_HIGH,
            );

        // Register KEY_DOWN_COMMAND for handling Enter at start of verse
        const handleEnterOnVerseUnregister = editor.registerCommand(
            KEY_DOWN_COMMAND,
            (event: KeyboardEvent) => {
                const backslashHandled = handleBackslashOnStartOfVerse(
                    editor,
                    event,
                );
                if (backslashHandled) return true;
                return handleEnterOnStartOfVerse(editor, event);
            },
            COMMAND_PRIORITY_HIGH,
        );

        // Cleanup function
        const cleanup = () => {
            unregisterTransformWhileTyping();
            redirectParaInsertionToLineBreakUnregister();
            moveToAdjacentNodesUnregister();
            removeStructuralEmptyParaOnBackspaceUnregister();
            insertParagraphAfterStructuralEmptyMarkerUnregister();
            handleEnterOnVerseUnregister();
        };

        return cleanup;
    }, [editor, projectLanguageDirection, editorModeSetting]);

    //   FIND HOTKEY TO OPEN PANEL
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === "f"
            ) {
                event.preventDefault();
                if (!search.isSearchPaneOpen) {
                    search.setIsSearchPaneOpen(true);
                }
                requestAnimationFrame(() => {
                    const searchInput = document.querySelector(
                        '[data-js="search-input"]',
                    ) as HTMLInputElement;
                    if (searchInput) {
                        searchInput.focus();
                    }
                });
            } else if (event.key === "Escape") {
                event.preventDefault();
                if (search.isSearchPaneOpen) {
                    search.setIsSearchPaneOpen(false);
                }
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [search]);
}
