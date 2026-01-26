import {
    COMMAND_PRIORITY_HIGH,
    COMMAND_PRIORITY_NORMAL,
    KEY_DOWN_COMMAND,
    type LexicalEditor,
} from "lexical";
import { useEffect } from "react";
import {
    handleBackslashOnStartOfVerse,
    handleEnterOnStartOfVerse,
    moveToAdjacentNodesWhenSeemsAppropriate,
} from "@/app/domain/editor/listeners/editorQualityOfLife.ts";
import {
    lockImmutableMarkersOnCopy,
    lockImmutableMarkersOnCut,
    lockImmutableMarkersOnPaste,
    lockImutableMarkersOnType,
} from "@/app/domain/editor/listeners/lockImmutableMarkers.ts";
import {
    inverseTextNodeTransform,
    textNodeTransform,
} from "@/app/domain/editor/listeners/manageUsfmMarkers.ts";
import { redirectParaInsertionToLineBreak } from "@/app/domain/editor/listeners/useLineBreaksNotParas.ts";
import { USFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

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
    const { markersMutableState, markersViewState, mode } = appSettings;

    useEffect(() => {
        // Register USFMTextNode transform
        const unregisterTransformWhileTyping = editor.registerNodeTransform(
            USFMTextNode,
            (node) => {
                const arg = {
                    node,
                    editor,
                    editorMode: mode,
                    markersMutableState,
                    markersViewState,
                    languageDirection: projectLanguageDirection,
                };
                textNodeTransform(arg);
                inverseTextNodeTransform(arg);
            },
        );

        // Redirect paragraph insertion to line break
        const redirectParaInsertionToLineBreakUnregister =
            redirectParaInsertionToLineBreak(editor);

        // Register KEY_DOWN_COMMAND for locking immutable markers on type
        const keyDownUnregister = editor.registerCommand(
            KEY_DOWN_COMMAND,
            (event: KeyboardEvent) => {
                return lockImutableMarkersOnType({
                    editor,
                    event,
                    markersMutableState,
                });
            },
            COMMAND_PRIORITY_NORMAL,
        );

        // Register KEY_DOWN_COMMAND for moving to adjacent nodes
        const moveToAdjacentNodesUnregister = editor.registerCommand(
            KEY_DOWN_COMMAND,
            (event: KeyboardEvent) => {
                return moveToAdjacentNodesWhenSeemsAppropriate(editor, event);
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

        // Register PASTE_COMMAND for locking immutable markers
        const pasteCommand = lockImmutableMarkersOnPaste(editor);

        // Register COPY_COMMAND for handling verse markers
        const lockOnCopy = lockImmutableMarkersOnCopy(
            editor,
            markersViewState,
            markersMutableState,
        );

        // Register CUT_COMMAND for locking immutable markers
        const lockImmutablesOnCut = lockImmutableMarkersOnCut(
            editor,
            markersViewState,
            markersMutableState,
        );

        // Cleanup function
        const cleanup = () => {
            unregisterTransformWhileTyping();
            redirectParaInsertionToLineBreakUnregister();
            keyDownUnregister();
            moveToAdjacentNodesUnregister();
            handleEnterOnVerseUnregister();
            pasteCommand();
            lockOnCopy();
            lockImmutablesOnCut();
        };

        return cleanup;
    }, [
        mode,
        markersViewState,
        editor,
        markersMutableState,
        projectLanguageDirection,
    ]);

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
