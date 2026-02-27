import type { LexicalEditor, LexicalNode } from "lexical";
import { type RefObject, useCallback, useState } from "react";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type { SearchResult } from "@/app/domain/search/SearchService.ts";
import { replaceMatchesInText } from "@/app/domain/search/search.utils.ts";
import type {
    SearchMatch,
    SearchRunResult,
} from "@/app/ui/hooks/search/searchTypes.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import {
    highlightMatches,
    type MatchInNode,
} from "@/app/ui/hooks/useSearchHighlighter.ts";
import { replaceInNodeText } from "@/core/domain/search/replaceEngine.ts";

type Params = {
    history: CustomHistoryHook;
    editorRef: RefObject<LexicalEditor | null>;
    searchReference: boolean;
    pickedResult: SearchResult | null;
    currentMatches: SearchMatch[];
    currentMatchIndex: number;
    setCurrentMatchIndex: (value: number) => void;
    setPickedResult: (value: SearchResult | null) => void;
    setCurrentMatches: (value: SearchMatch[]) => void;
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
    pickedFile: ParsedFile;
    pickedChapter?: ParsedChapter;
    setTargetResults: (value: SearchResult[]) => void;
    setReferenceResults: (value: SearchResult[]) => void;
};

export function useSearchReplace({
    history,
    editorRef,
    searchReference,
    pickedResult,
    currentMatches,
    currentMatchIndex,
    setCurrentMatchIndex,
    setPickedResult,
    setCurrentMatches,
    searchTerm,
    runSearchLogic,
    matchCase,
    matchWholeWord,
    pickedFile,
    pickedChapter,
    setTargetResults,
    setReferenceResults,
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
                highlightMatches(
                    searchMatches,
                    editorRef.current,
                    nextActiveMatch,
                );
            }

            const nextResult = sortedResults.find(
                (r) =>
                    r.source === "target" &&
                    r.sid === nextActiveMatch.sid &&
                    r.sidOccurrenceIndex ===
                        nextActiveMatch.sidOccurrenceIndex &&
                    r.bibleIdentifier === pickedFile.bookCode &&
                    r.chapNum === pickedChapter?.chapNumber,
            );
            setPickedResult(nextResult ?? null);
        },
        [
            currentMatches,
            editorRef,
            findMatchIndex,
            history,
            pickedChapter?.chapNumber,
            pickedFile.bookCode,
            pickedResult?.source,
            replaceTerm,
            runSearchLogic,
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
            highlightMatches(searchMatches, editorRef.current, nextActiveMatch);
        }

        const nextResult = sortedResults.find(
            (r) =>
                r.source === "target" &&
                r.sid === nextActiveMatch.sid &&
                r.sidOccurrenceIndex === nextActiveMatch.sidOccurrenceIndex &&
                r.bibleIdentifier === pickedFile.bookCode &&
                r.chapNum === pickedChapter?.chapNumber,
        );
        setPickedResult(nextResult ?? null);
    }, [
        currentMatchIndex,
        currentMatches,
        editorRef,
        history,
        pickedChapter?.chapNumber,
        pickedFile.bookCode,
        pickedResult,
        replaceTerm,
        runSearchLogic,
        searchReference,
        searchTerm,
        setCurrentMatchIndex,
        setPickedResult,
    ]);

    const replaceAllInChapter = useCallback(async () => {
        if (searchReference) return;
        if (!pickedResult || !replaceTerm) return;
        if (pickedResult.source === "reference") return;
        const editor = editorRef.current;
        if (!editor) return;

        history.setNextTypingLabel(
            `Replace All (${pickedResult.bibleIdentifier} ${pickedResult.chapNum})`,
        );
        editor.update(
            () => {
                const uniqueNodes = currentMatches.reduce(
                    (
                        acc: { seen: Set<string>; nodes: LexicalNode[] },
                        curr,
                    ) => {
                        const nodeId = curr.node.getKey();
                        if (!acc.seen.has(nodeId)) {
                            acc.seen.add(nodeId);
                            acc.nodes.push(curr.node);
                        }
                        return acc;
                    },
                    {
                        seen: new Set<string>(),
                        nodes: [] as LexicalNode[],
                    },
                );

                uniqueNodes.nodes.forEach((node: LexicalNode) => {
                    if (!$isUSFMTextNode(node)) return;
                    const text = node.getTextContent();
                    const newText = replaceMatchesInText({
                        text,
                        searchTerm,
                        replaceTerm,
                        matchCase,
                        matchWholeWord,
                    });
                    node.setTextContent(newText);
                });
            },
            { discrete: true },
        );

        if (searchTerm.trim()) {
            await runSearchLogic(searchTerm, {
                autoPick: false,
                scope: "currentChapter",
            });
        } else {
            setTargetResults([]);
            setReferenceResults([]);
            setCurrentMatches([]);
            setCurrentMatchIndex(0);
            setPickedResult(null);
        }
    }, [
        currentMatches,
        editorRef,
        history,
        matchCase,
        matchWholeWord,
        pickedResult,
        replaceTerm,
        runSearchLogic,
        searchReference,
        searchTerm,
        setCurrentMatches,
        setCurrentMatchIndex,
        setPickedResult,
        setReferenceResults,
        setTargetResults,
    ]);

    return {
        replaceTerm,
        setReplaceTerm,
        replaceMatch,
        replaceCurrentMatch,
        replaceAllInChapter,
    };
}
