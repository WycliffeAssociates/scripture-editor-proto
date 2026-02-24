import {
    $createLineBreakNode,
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_HIGH,
    COPY_COMMAND,
    CUT_COMMAND,
    KEY_BACKSPACE_COMMAND,
    KEY_DOWN_COMMAND,
    KEY_ENTER_COMMAND,
    type LexicalEditor,
    type LexicalNode,
    PASTE_COMMAND,
} from "lexical";
import { useEffect } from "react";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    handleBackslashOnStartOfVerse,
    handleEnterOnStartOfVerse,
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
import { expandSelectionToIncludePrecedingVerseMarker } from "@/app/domain/editor/utils/expandSelectionToIncludeVerseMarker.ts";
import { calculateIsStartOfLine } from "@/app/domain/editor/utils/nodePositionUtils.ts";
import {
    isUsfmLikePaste,
    parseClipboardUsfmToTokens,
    parsedUsfmTokensToInsertableNodes,
} from "@/app/domain/editor/utils/usfmPaste.ts";
import { ShowErrorNotification } from "@/app/ui/components/primitives/Notifications.tsx";
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
    const { project, projectLanguageDirection, search, history } =
        useWorkspaceContext();
    const { appSettings } = project;
    const editorModeSetting = appSettings.editorMode ?? "regular";

    useEffect(() => {
        if (editorModeSetting === "view") {
            return;
        }
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

        const expandVerseCopySelectionUnregister = editor.registerCommand(
            COPY_COMMAND,
            (payload) => {
                if (editorModeSetting !== "regular") return false;

                const event =
                    payload instanceof Event
                        ? (payload as ClipboardEvent | KeyboardEvent)
                        : null;

                const restoreRef: {
                    current: {
                        anchor: {
                            key: string;
                            offset: number;
                            type: "text" | "element";
                        };
                        focus: {
                            key: string;
                            offset: number;
                            type: "text" | "element";
                        };
                        format: number;
                        style: string;
                    } | null;
                } = {
                    current: null,
                };

                editor.update(
                    () => {
                        const selection = $getSelection();
                        if (
                            !$isRangeSelection(selection) ||
                            selection.isCollapsed()
                        ) {
                            return;
                        }

                        const snapshot = selection.clone();
                        const didExpand =
                            expandSelectionToIncludePrecedingVerseMarker(
                                selection,
                            );
                        if (!didExpand) return;

                        restoreRef.current = {
                            anchor: {
                                key: snapshot.anchor.key,
                                offset: snapshot.anchor.offset,
                                type: snapshot.anchor.type,
                            },
                            focus: {
                                key: snapshot.focus.key,
                                offset: snapshot.focus.offset,
                                type: snapshot.focus.type,
                            },
                            format: snapshot.format,
                            style: snapshot.style,
                        };
                    },
                    { discrete: true, event },
                );

                const restoreSelection = restoreRef.current;
                if (restoreSelection) {
                    queueMicrotask(() => {
                        editor.update(
                            () => {
                                const selection = $getSelection();
                                if (!$isRangeSelection(selection)) return;

                                selection.anchor.set(
                                    restoreSelection.anchor.key,
                                    restoreSelection.anchor.offset,
                                    restoreSelection.anchor.type,
                                );
                                selection.focus.set(
                                    restoreSelection.focus.key,
                                    restoreSelection.focus.offset,
                                    restoreSelection.focus.type,
                                );
                                selection.setFormat(restoreSelection.format);
                                selection.setStyle(restoreSelection.style);
                            },
                            { discrete: true },
                        );
                    });
                }

                return false;
            },
            COMMAND_PRIORITY_HIGH,
        );

        const expandVerseCutSelectionUnregister = editor.registerCommand(
            CUT_COMMAND,
            (payload) => {
                if (editorModeSetting !== "regular") return false;

                const event =
                    payload instanceof Event
                        ? (payload as ClipboardEvent | KeyboardEvent)
                        : null;

                editor.update(
                    () => {
                        const selection = $getSelection();
                        if (
                            !$isRangeSelection(selection) ||
                            selection.isCollapsed()
                        ) {
                            return;
                        }
                        expandSelectionToIncludePrecedingVerseMarker(selection);
                    },
                    { discrete: true, event },
                );

                return false;
            },
            COMMAND_PRIORITY_HIGH,
        );

        const usfmAwarePasteUnregister = editor.registerCommand(
            PASTE_COMMAND,
            (payload) => {
                const event =
                    payload instanceof Event
                        ? (payload as ClipboardEvent)
                        : null;
                const plainText = event?.clipboardData?.getData("text/plain");
                if (!event || !plainText) return false;
                if (!isUsfmLikePaste(plainText)) return false;

                event.preventDefault();
                event.stopPropagation();

                const parsed = parseClipboardUsfmToTokens({
                    text: plainText,
                    bookCode: project.pickedFile.bookCode,
                    direction: projectLanguageDirection,
                });
                if (!parsed.ok) {
                    ShowErrorNotification({
                        notification: {
                            title: "Paste Failed",
                            message:
                                "Invalid USFM content could not be pasted.",
                        },
                    });
                    return true;
                }

                editor.update(
                    () => {
                        const selection = $getSelection();
                        if (!$isRangeSelection(selection)) return;
                        selection.insertNodes(
                            parsedUsfmTokensToInsertableNodes(parsed.tokens),
                        );
                    },
                    { discrete: true, event },
                );

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
            expandVerseCopySelectionUnregister();
            expandVerseCutSelectionUnregister();
            usfmAwarePasteUnregister();
            handleEnterOnVerseUnregister();
        };

        return cleanup;
    }, [
        editor,
        projectLanguageDirection,
        editorModeSetting,
        project.pickedFile.bookCode,
    ]);

    //   FIND HOTKEY TO OPEN PANEL
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const rootEl = editor.getRootElement();
            const isEditorFocused =
                !!rootEl && rootEl.contains(document.activeElement);
            const isUndo =
                (event.metaKey || event.ctrlKey) && event.key === "z";
            const isRedo =
                (event.metaKey || event.ctrlKey) &&
                ((event.shiftKey && event.key === "Z") || event.key === "y");

            // Route undo/redo through custom history so post-undo listeners
            // (search highlight/result rerun) always execute on keyboard shortcuts.
            if (isEditorFocused && isUndo) {
                event.preventDefault();
                history.undo();
                return;
            }
            if (isEditorFocused && isRedo) {
                event.preventDefault();
                history.redo();
                return;
            }

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
    }, [editor, history, search]);
}
