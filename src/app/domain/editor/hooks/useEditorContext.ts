import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isRangeSelection } from "lexical";
import { useCallback } from "react";
import { $isUSFMElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import type { EditorContext } from "../actions/types.ts";

export function useEditorContext() {
    const [editor] = useLexicalComposerContext();
    const { actions, search: searchApi, project } = useWorkspaceContext();
    const { mode, markersViewState, markersMutableState } = project.appSettings;

    const getContext = useCallback((): EditorContext => {
        return editor.getEditorState().read(() => {
            const selection = $getSelection();
            const nativeSelection = window.getSelection();
            let selectedText = "";
            let suggestedSearchTerm = "";

            if (nativeSelection && nativeSelection.rangeCount > 0) {
                selectedText = nativeSelection.toString().trim();
            }

            if (!selectedText && $isRangeSelection(selection)) {
                selectedText = selection.getTextContent().trim();
            }

            suggestedSearchTerm = selectedText;

            if (!suggestedSearchTerm && $isRangeSelection(selection)) {
                if (selection.isCollapsed()) {
                    const anchorNode = selection.anchor.getNode();
                    if ($isUSFMTextNode(anchorNode)) {
                        const text = anchorNode.getTextContent();
                        const offset = selection.anchor.offset;

                        let start = offset;
                        while (start > 0 && /\w/.test(text[start - 1])) {
                            start--;
                        }

                        let end = offset;
                        while (end < text.length && /\w/.test(text[end])) {
                            end++;
                        }

                        if (start !== end) {
                            suggestedSearchTerm = text.slice(start, end);
                        }
                    }
                }
            }

            const nodePath: string[] = [];
            let currentVerse: string | undefined;
            let currentMarker: string | undefined;

            if ($isRangeSelection(selection)) {
                const node = selection.anchor.getNode();

                // 1. Traverse up to build node path and find metadata
                let curr: any = node;
                while (curr) {
                    const type = curr.getType();
                    nodePath.push(type);

                    if ($isUSFMTextNode(curr) || $isUSFMElementNode(curr)) {
                        const marker = curr.getMarker();
                        if (marker) {
                            if (!currentMarker) currentMarker = marker;
                            nodePath.push(`marker:${marker}`);
                        }
                        const sid = curr.getSid();
                        if (sid && !currentVerse) currentVerse = sid;
                    }
                    curr = curr.getParent();
                }

                // 2. If no marker found in ancestors, search backward from current position
                if (!currentMarker) {
                    let searchCurr: any = node;
                    while (searchCurr) {
                        if (
                            $isUSFMTextNode(searchCurr) &&
                            searchCurr.getTokenType() === "marker"
                        ) {
                            currentMarker = searchCurr.getMarker();
                            break;
                        }
                        const prev = searchCurr.getPreviousSibling();
                        if (prev) {
                            searchCurr = prev;
                        } else {
                            // If no siblings left, try parent (though ancestors were already checked)
                            // or stop if we hit something that shouldn't be crossed
                            searchCurr = searchCurr.getParent();
                            if ($isUSFMElementNode(searchCurr)) {
                                const m = searchCurr.getMarker();
                                if (m) {
                                    currentMarker = m;
                                    break;
                                }
                            }
                        }

                        // Safety break to avoid infinite loop or searching too far
                        if (nodePath.length > 50) break;
                    }
                }
            }

            return {
                selection,
                nativeSelection,
                selectedText,
                suggestedSearchTerm,
                nodePath,
                currentVerse,
                currentMarker,
                mode,
                markersViewState,
                markersMutableState,
                actions,
                searchApi,
            };
        });
    }, [
        editor,
        mode,
        markersViewState,
        markersMutableState,
        actions,
        searchApi,
    ]);

    return { getContext };
}
