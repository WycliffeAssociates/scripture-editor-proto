import { useRouter } from "@tanstack/react-router";
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
    PASTE_COMMAND,
    SELECTION_CHANGE_COMMAND,
} from "lexical";
import { useEffect } from "react";
import { DATA_JS } from "@/app/data/constants.ts";
import {
    EDITOR_MODES,
    editorModeToShape,
    UsfmTokenTypes,
} from "@/app/data/editor.ts";
import {
    moveToAdjacentNodesWhenSeemsAppropriate,
    normalizeSelectionAtHiddenMarkerBoundary,
    redirectPrintableTypingAtHiddenMarkerBoundary,
} from "@/app/domain/editor/listeners/editorQualityOfLife.ts";
import {
    inverseTextNodeTransform,
    textNodeTransform,
} from "@/app/domain/editor/listeners/manageUsfmMarkers.ts";
import { redirectParaInsertionToLineBreak } from "@/app/domain/editor/listeners/useLineBreaksNotParas.ts";
import { registerNumberedMarkerBehaviors } from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";
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
import { registerUsfmCopy } from "@/app/domain/editor/utils/usfmCopy.ts";
import {
    isUsfmLikePaste,
    parseClipboardUsfmToTokens,
    parsedUsfmTokensToInsertableNodes,
} from "@/app/domain/editor/utils/usfmPaste.ts";
import { showErrorNotification } from "@/app/ui/components/primitives/notifications.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import { isValidParaMarker } from "@/core/domain/usfm/onionMarkers.ts";

/**
 * Register the main input/command pipeline for the scripture editor.
 *
 * This hook is where low-level typing, backspace, enter, paste, and selection
 * behavior get connected to the USFM-aware listener helpers. In practice this
 * is one of the places where the generic Lexical editor becomes "our USFM
 * editor" because it starts enforcing marker boundaries, structural-empty
 * paragraphs, verse behavior, and paste normalization.
 */
export function useEditorInput(editor: LexicalEditor) {
    const { project, projectLanguageDirection, search } = useWorkspaceContext();
    const { usfmOnionService } = useRouter().options.context;
    const { appSettings } = project;
    const editorModeSetting = appSettings.editorMode;

    useEffect(() => {
        if (editorModeSetting === EDITOR_MODES.view) {
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

        // Numbered-marker (\c/\v) caret + editing behavior: direction-agnostic
        // boundary stops (the prose-edge `text@0` and the number's end are both
        // reachable, color-distinguished by NumberedCaretPlugin), the
        // canonicalization defenses that hold `text@0`, two-stage delete,
        // empty-node retype, and the space-jump. Self-gating — acts only when the
        // selection is in a numbered node, which exists only in the regular shape.
        const numberedMarkerBehaviorsUnregister =
            registerNumberedMarkerBehaviors(editor);

        // Regular-mode copy/cut: text/plain = USFM bytes via the token
        // waist (flat modes' default copy is already the bytes).
        const usfmCopyUnregister =
            editorModeSetting === EDITOR_MODES.regular
                ? registerUsfmCopy(editor)
                : null;

        // Hidden-byte char/note markers (flat `marker` tokens): nudge the caret
        // past their bytes to the adjacent content. These skip numbered nodes
        // (tokenType `numberedMarker`), which own their boundary behavior above.
        const normalizeSelectionAtHiddenMarkerBoundaryUnregister =
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    if (editorModeSetting !== EDITOR_MODES.regular)
                        return false;
                    return normalizeSelectionAtHiddenMarkerBoundary(editor);
                },
                COMMAND_PRIORITY_HIGH,
            );

        const moveToAdjacentNodesUnregister = editor.registerCommand(
            KEY_DOWN_COMMAND,
            (event: KeyboardEvent) => {
                if (
                    editorModeSetting === EDITOR_MODES.regular &&
                    redirectPrintableTypingAtHiddenMarkerBoundary(editor, event)
                ) {
                    return true;
                }
                return moveToAdjacentNodesWhenSeemsAppropriate(editor, event);
            },
            COMMAND_PRIORITY_HIGH,
        );

        const removeStructuralEmptyParaOnBackspaceUnregister =
            editor.registerCommand(
                KEY_BACKSPACE_COMMAND,
                (event: KeyboardEvent) => {
                    if (editorModeSetting !== EDITOR_MODES.regular)
                        return false;
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
                        {
                            editor,
                            editorMode: editorModeSetting,
                        },
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
                    if (editorModeSetting !== EDITOR_MODES.regular)
                        return false;

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

                void (async () => {
                    const parsed = await parseClipboardUsfmToTokens({
                        text: plainText,
                        bookCode: project.pickedFile.bookCode,
                        direction: projectLanguageDirection,
                        usfmOnionService,
                    });
                    if (!parsed.ok) {
                        showErrorNotification({
                            notification: {
                                title: "Paste Failed",
                                message:
                                    "Invalid USFM content could not be pasted.",
                            },
                        });
                        return;
                    }

                    editor.update(
                        () => {
                            const selection = $getSelection();
                            if (!$isRangeSelection(selection)) return;
                            selection.insertNodes(
                                parsedUsfmTokensToInsertableNodes(
                                    parsed.tokens,
                                    editorModeToShape(editorModeSetting),
                                ),
                            );
                        },
                        { discrete: true, event },
                    );
                })();

                return true;
            },
            COMMAND_PRIORITY_HIGH,
        );

        // Cleanup function
        const cleanup = () => {
            unregisterTransformWhileTyping();
            redirectParaInsertionToLineBreakUnregister();
            numberedMarkerBehaviorsUnregister();
            normalizeSelectionAtHiddenMarkerBoundaryUnregister();
            moveToAdjacentNodesUnregister();
            removeStructuralEmptyParaOnBackspaceUnregister();
            insertParagraphAfterStructuralEmptyMarkerUnregister();
            usfmAwarePasteUnregister();
            usfmCopyUnregister?.();
        };

        return cleanup;
    }, [
        editor,
        projectLanguageDirection,
        editorModeSetting,
        project.pickedFile.bookCode,
        usfmOnionService,
    ]);

    //   FIND HOTKEY TO OPEN PANEL
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Undo/redo shortcuts are NOT handled here: Lexical's root
            // keydown dispatches UNDO_COMMAND/REDO_COMMAND, which
            // `CustomHistoryPlugin` routes into custom history. A duplicate
            // document-level route would double-pop — keydown bubbles past
            // Lexical's preventDefault, so both handlers fire.
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
                        `[data-js="${DATA_JS.searchInput}"]`,
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
