import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
    $getSelection,
    $isRangeSelection,
    type ElementNode,
    type LexicalNode,
} from "lexical";
import { useCallback } from "react";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import { $isUSFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    canPromoteLeadingVerseNumber,
    getLeadingVerseNumberFromText,
} from "@/app/domain/editor/utils/verseMarkerHeuristics.ts";
import { isSelectedVerseNumber } from "@/app/domain/editor/utils/verseNumberHeuristics.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import type { EditorContext } from "../actions/types.ts";

type SelectionContext = Pick<
    EditorContext,
    | "selection"
    | "nativeSelection"
    | "selectedText"
    | "suggestedSearchTerm"
    | "nodePath"
    | "currentVerse"
    | "currentMarker"
    | "canMakeVerseMarkerFromCursor"
    | "makeVerseMarkerNumber"
>;

/**
 * Read the current Lexical selection into the smaller editor-action context
 * model used by command palettes and contextual actions.
 *
 * This hook sits at the edge between live editor state and UI action surfaces:
 * it inspects the latest Lexical selection, derives stable hints such as the
 * active marker, verse, and suggested search term, and returns a getter so
 * action menus can request a fresh snapshot on demand.
 */
function getSelectedText(selection: ReturnType<typeof $getSelection>): string {
    const nativeSelection = window.getSelection();
    if (nativeSelection && nativeSelection.rangeCount > 0) {
        return nativeSelection.toString().trim();
    }

    if ($isRangeSelection(selection)) {
        return selection.getTextContent().trim();
    }

    return "";
}

function getSuggestedSearchTerm(
    selection: ReturnType<typeof $getSelection>,
    selectedText: string,
): string {
    if (
        selectedText ||
        !($isRangeSelection(selection) && selection.isCollapsed())
    ) {
        return selectedText;
    }

    const anchorNode = selection.anchor.getNode();
    if (!$isUSFMTextNode(anchorNode)) {
        return selectedText;
    }

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

    return start !== end ? text.slice(start, end) : selectedText;
}

function getVerseMarkerHint(
    selection: ReturnType<typeof $getSelection>,
    selectedText: string,
): Pick<
    SelectionContext,
    "canMakeVerseMarkerFromCursor" | "makeVerseMarkerNumber"
> {
    if (!$isRangeSelection(selection)) {
        return {
            canMakeVerseMarkerFromCursor: false,
            makeVerseMarkerNumber: undefined,
        };
    }

    const node = selection.anchor.getNode();
    if (!$isUSFMTextNode(node)) {
        return {
            canMakeVerseMarkerFromCursor: false,
            makeVerseMarkerNumber: undefined,
        };
    }

    if (selection.isCollapsed()) {
        const parsed = canPromoteLeadingVerseNumber(node);
        return {
            canMakeVerseMarkerFromCursor: !!parsed,
            makeVerseMarkerNumber: parsed?.verseNumber,
        };
    }

    if (selectedText && isSelectedVerseNumber(selectedText)) {
        return {
            canMakeVerseMarkerFromCursor: false,
            makeVerseMarkerNumber: selectedText,
        };
    }

    if (selectedText) {
        return {
            canMakeVerseMarkerFromCursor: false,
            makeVerseMarkerNumber:
                getLeadingVerseNumberFromText(selectedText)?.verseNumber,
        };
    }

    return {
        canMakeVerseMarkerFromCursor: false,
        makeVerseMarkerNumber: undefined,
    };
}

function collectRangeSelectionMetadata(
    selection: ReturnType<typeof $getSelection>,
): Pick<SelectionContext, "nodePath" | "currentVerse" | "currentMarker"> {
    const nodePath: string[] = [];
    let currentVerse: string | undefined;
    let currentMarker: string | undefined;

    if (!$isRangeSelection(selection)) {
        return {
            nodePath,
            currentVerse,
            currentMarker,
        };
    }

    const node = selection.anchor.getNode();

    let curr: LexicalNode | ElementNode | null = node;
    while (curr) {
        const type = curr.getType();
        nodePath.push(type);

        if ($isUSFMTextNode(curr) || $isUSFMParagraphNode(curr)) {
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

    if (!currentMarker) {
        let searchCurr: LexicalNode | null | ElementNode = node;
        while (searchCurr) {
            if (
                $isUSFMTextNode(searchCurr) &&
                searchCurr.getTokenType() === "marker"
            ) {
                currentMarker = searchCurr.getMarker();
                break;
            }
            const prev: LexicalNode | null | ElementNode =
                searchCurr.getPreviousSibling();
            if (prev) {
                searchCurr = prev;
            } else {
                searchCurr = searchCurr.getParent();
                if ($isUSFMParagraphNode(searchCurr)) {
                    const m = searchCurr.getMarker();
                    if (m) {
                        currentMarker = m;
                        break;
                    }
                }
            }

            if (nodePath.length > 50) break;
        }
    }

    return {
        nodePath,
        currentVerse,
        currentMarker,
    };
}

function collectSelectionContext(
    selection: ReturnType<typeof $getSelection>,
): SelectionContext {
    const selectedText = getSelectedText(selection);
    const suggestedSearchTerm = getSuggestedSearchTerm(selection, selectedText);
    const { canMakeVerseMarkerFromCursor, makeVerseMarkerNumber } =
        getVerseMarkerHint(selection, selectedText);
    const { nodePath, currentVerse, currentMarker } =
        collectRangeSelectionMetadata(selection);

    return {
        selection,
        nativeSelection: window.getSelection(),
        selectedText,
        suggestedSearchTerm,
        nodePath,
        currentVerse,
        currentMarker,
        canMakeVerseMarkerFromCursor,
        makeVerseMarkerNumber,
    };
}

export function useEditorContext() {
    const [editor] = useLexicalComposerContext();
    const {
        actions,
        search: searchApi,
        project,
        projectLanguageDirection,
    } = useWorkspaceContext();
    const editorMode = project.appSettings.editorMode ?? EDITOR_MODES.regular;
    const colorScheme = project.appSettings.colorScheme ?? "light";

    const getContext = useCallback((): EditorContext => {
        return editor.getEditorState().read(() => {
            const selection = $getSelection();
            const selectionContext = collectSelectionContext(selection);

            return {
                ...selectionContext,
                editorMode,
                languageDirection: projectLanguageDirection,
                colorScheme,
                actions,
                searchApi,
            };
        });
    }, [
        editor,
        editorMode,
        actions,
        searchApi,
        projectLanguageDirection,
        colorScheme,
    ]);

    return { getContext };
}
