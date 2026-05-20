import type { LexicalEditor } from "lexical";
import { type RefObject, useCallback, useState } from "react";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type { SearchResult } from "@/app/domain/search/SearchService.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { SearchHighlightStore } from "@/app/state/SearchHighlightStore.ts";
import type {
    SearchMatch,
    SearchRunResult,
} from "@/app/ui/hooks/search/searchTypes.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import {
    type MatchInNode,
    scrollToActiveMatchInEditor,
} from "@/app/ui/hooks/useSearchHighlighter.ts";
import { replaceInNodeText } from "@/core/domain/search/replaceEngine.ts";

type Params = {
    history: CustomHistoryHook;
    editorRef: RefObject<LexicalEditor | null>;
    searchHighlightStore: SearchHighlightStore;
    searchReference: boolean;
    pickedResult: SearchResult | null;
    currentMatches: SearchMatch[];
    currentMatchIndex: number;
    setCurrentMatchIndex: (value: number) => void;
    setPickedResult: (value: SearchResult | null) => void;
    searchTerm: string;
    runSearchLogic: (
        query: string,
        options?: {
            autoPick?: boolean;
            scope?: "project" | "currentChapter";
            overrides?: {
                matchCase?: boolean;
                matchWholeWord?: boolean;
                searchUSFM?: boolean;
                searchReference?: boolean;
            };
        },
    ) => Promise<SearchRunResult | null>;
    matchCase: boolean;
    matchWholeWord: boolean;
    pickedFile: ScriptureBookState;
    pickedChapter?: ScriptureChapterState;
    preparePickedResult: (
        result: SearchResult,
        args: {
            activeSearchTerm: string;
            searchReference: boolean;
            matchCase: boolean;
            matchWholeWord: boolean;
        },
    ) => Promise<{
        matches: SearchMatch[];
        activeMatch?: SearchMatch;
    } | null>;
};

/**
 * Hook that owns inline replace operations for the current scripture editor.
 *
 * Replace always acts on the live editable scripture workspace, never on the
 * reference pane. After mutating the current editor tree it re-runs scoped search
 * so result selection and highlights stay accurate.
 */
export function useSearchReplace({
    history,
    editorRef,
    searchHighlightStore,
    searchReference,
    pickedResult,
    currentMatches,
    currentMatchIndex,
    setCurrentMatchIndex,
    setPickedResult,
    searchTerm,
    runSearchLogic,
    matchCase,
    matchWholeWord,
    pickedFile,
    pickedChapter,
    preparePickedResult,
}: Params) {
    const [replaceTerm, setReplaceTerm] = useState<string>("");

    const findMatchIndex = useCallback(
        (target: MatchInNode) =>
            currentMatches.findIndex(
                (candidate) =>
                    candidate.node.getKey() === target.node.getKey() &&
                    candidate.start === target.start &&
                    candidate.end === target.end,
            ),
        [currentMatches],
    );

    const replaceMatch = useCallback(
        async (targetMatch: MatchInNode) => {
            if (searchReference) return;
            if (pickedResult?.source === "reference") return;
            if (!replaceTerm || !searchTerm.trim()) return;
            const editor = editorRef.current;
            if (!editor) return;

            const matchedIndex = findMatchIndex(targetMatch);
            if (matchedIndex === -1) return;

            const match = currentMatches[matchedIndex];
            if (!match) return;

            history.setNextTypingLabel("Replace (Inline Match)", {
                forceNewEntry: true,
            });
            editor.update(
                () => {
                    const node = match.node;
                    if (!$isUSFMTextNode(node)) return;

                    const text = node.getTextContent();
                    const newText = replaceInNodeText({
                        text,
                        start: match.start,
                        end: match.end,
                        replacement: replaceTerm,
                    });

                    node.setTextContent(newText);
                },
                { discrete: true },
            );

            const rerunResult = await runSearchLogic(searchTerm, {
                autoPick: false,
                scope: "currentChapter",
            });
            if (!rerunResult) return;

            const { searchMatches, sortedResults } = rerunResult;
            if (searchMatches.length === 0) {
                setPickedResult(null);
                return;
            }

            const nextIndex = Math.min(matchedIndex, searchMatches.length - 1);
            const nextActiveMatch = searchMatches[nextIndex];
            if (!nextActiveMatch) return;

            setCurrentMatchIndex(nextIndex);

            if (editorRef.current) {
                searchHighlightStore.set([
                    {
                        editor: editorRef.current,
                        matches: searchMatches,
                        activeMatch: nextActiveMatch,
                    },
                ]);
                scrollToActiveMatchInEditor(editorRef.current, nextActiveMatch);
            }

            const nextResult = sortedResults.find(
                (r) =>
                    r.source === "target" &&
                    r.sid === nextActiveMatch.sid &&
                    r.sidOccurrenceIndex ===
                        nextActiveMatch.sidOccurrenceIndex &&
                    r.bibleIdentifier === pickedFile.bookCode &&
                    r.chapNum === pickedChapter?.chapterNumber,
            );
            setPickedResult(nextResult ?? null);
        },
        [
            currentMatches,
            editorRef,
            findMatchIndex,
            history,
            pickedChapter?.chapterNumber,
            pickedFile.bookCode,
            pickedResult?.source,
            replaceTerm,
            runSearchLogic,
            searchHighlightStore,
            searchReference,
            searchTerm,
            setCurrentMatchIndex,
            setPickedResult,
        ],
    );

    const replaceCurrentMatch = useCallback(async () => {
        if (searchReference) return;
        if (currentMatches.length === 0 || !pickedResult || !replaceTerm)
            return;
        if (pickedResult.source === "reference") return;
        const editor = editorRef.current;
        if (!editor) return;

        const currentMatch = currentMatches[currentMatchIndex];
        if (!currentMatch) return;

        history.setNextTypingLabel("Replace (Current Match)");
        editor.update(
            () => {
                const node = currentMatch.node;
                if (!$isUSFMTextNode(node)) return;

                const text = node.getTextContent();
                const newText = replaceInNodeText({
                    text,
                    start: currentMatch.start,
                    end: currentMatch.end,
                    replacement: replaceTerm,
                });

                node.setTextContent(newText);
            },
            { discrete: true },
        );

        if (!searchTerm.trim()) return;

        const previousIndex = currentMatchIndex;
        const rerunResult = await runSearchLogic(searchTerm, {
            autoPick: false,
            scope: "currentChapter",
        });
        if (!rerunResult) return;

        const { searchMatches, sortedResults } = rerunResult;
        if (searchMatches.length === 0) {
            setPickedResult(null);
            return;
        }

        const nextIndex = Math.min(previousIndex, searchMatches.length - 1);
        const nextActiveMatch = searchMatches[nextIndex];
        if (!nextActiveMatch) return;

        setCurrentMatchIndex(nextIndex);

        if (editorRef.current) {
            searchHighlightStore.set([
                {
                    editor: editorRef.current,
                    matches: searchMatches,
                    activeMatch: nextActiveMatch,
                },
            ]);
            scrollToActiveMatchInEditor(editorRef.current, nextActiveMatch);
        }

        const nextResult = sortedResults.find(
            (r) =>
                r.source === "target" &&
                r.sid === nextActiveMatch.sid &&
                r.sidOccurrenceIndex === nextActiveMatch.sidOccurrenceIndex &&
                r.bibleIdentifier === pickedFile.bookCode &&
                r.chapNum === pickedChapter?.chapterNumber,
        );
        setPickedResult(nextResult ?? null);
    }, [
        currentMatchIndex,
        currentMatches,
        editorRef,
        history,
        pickedChapter?.chapterNumber,
        pickedFile.bookCode,
        pickedResult,
        replaceTerm,
        runSearchLogic,
        searchHighlightStore,
        searchReference,
        searchTerm,
        setCurrentMatchIndex,
        setPickedResult,
    ]);

    const replaceSearchResult = useCallback(
        async (result: SearchResult, replacement: string) => {
            if (searchReference) return;
            if (result.source === "reference") return;
            if (!replacement.trim() || !searchTerm.trim()) return;
            const editor = editorRef.current;
            if (!editor) return;

            const prepared = await preparePickedResult(result, {
                activeSearchTerm: searchTerm,
                searchReference,
                matchCase,
                matchWholeWord,
            });
            const activeMatch = prepared?.activeMatch;
            if (!activeMatch || activeMatch.source !== "target") return;

            history.setNextTypingLabel("Replace (Search Result)", {
                forceNewEntry: true,
            });
            editor.update(
                () => {
                    const node = activeMatch.node;
                    if (!$isUSFMTextNode(node)) return;

                    const text = node.getTextContent();
                    const newText = replaceInNodeText({
                        text,
                        start: activeMatch.start,
                        end: activeMatch.end,
                        replacement: replacement.trim(),
                    });

                    node.setTextContent(newText);
                },
                { discrete: true },
            );

            const rerunResult = await runSearchLogic(searchTerm, {
                autoPick: false,
                scope: "currentChapter",
            });
            if (!rerunResult) return;

            const refreshedResult = rerunResult.sortedResults.find(
                (candidate) =>
                    candidate.source === "target" &&
                    candidate.sid === result.sid &&
                    candidate.sidOccurrenceIndex ===
                        result.sidOccurrenceIndex &&
                    candidate.bibleIdentifier === result.bibleIdentifier &&
                    candidate.chapNum === result.chapNum,
            );

            if (!refreshedResult) {
                setPickedResult(null);
                return;
            }

            await preparePickedResult(refreshedResult, {
                activeSearchTerm: searchTerm,
                searchReference,
                matchCase,
                matchWholeWord,
            });
        },
        [
            editorRef,
            history,
            matchCase,
            matchWholeWord,
            preparePickedResult,
            runSearchLogic,
            searchReference,
            searchTerm,
            setPickedResult,
        ],
    );

    return {
        replaceTerm,
        setReplaceTerm,
        replaceMatch,
        replaceCurrentMatch,
        replaceSearchResult,
    };
}
