import { $getRoot, type LexicalEditor } from "lexical";
import { type RefObject, useCallback, useState } from "react";
import type { ParsedChapter } from "@/app/data/parsedProject.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type {
    SearchResult,
    SearchSource,
} from "@/app/domain/search/SearchService.ts";
import { escapeRegex } from "@/app/domain/search/search.utils.ts";
import type {
    SearchMatch,
    SearchRunOptionOverrides,
} from "@/app/ui/hooks/search/searchTypes.ts";
import {
    clearHighlights,
    highlightMatches,
    highlightMatchesAcrossEditors,
    type MatchInNode,
} from "@/app/ui/hooks/useSearchHighlighter.ts";

type Params = {
    editorRef: RefObject<LexicalEditor | null>;
    referenceEditorRef: RefObject<LexicalEditor | null>;
    switchBookOrChapter: (
        file: string,
        chapter: number,
    ) => ParsedChapter | undefined;
};

export function useSearchNavigation({
    editorRef,
    referenceEditorRef,
    switchBookOrChapter,
}: Params) {
    const [currentMatches, setCurrentMatches] = useState<SearchMatch[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
    const [pickedResult, setPickedResult] = useState<SearchResult | null>(null);

    const collectMatchesInEditor = useCallback(
        (
            editor: LexicalEditor,
            source: SearchSource,
            activeSearchTerm: string,
            options: SearchRunOptionOverrides & {
                baseMatchCase: boolean;
                baseMatchWholeWord: boolean;
            },
        ) => {
            const effectiveMatchCase =
                options.matchCase ?? options.baseMatchCase;
            const effectiveMatchWholeWord =
                options.matchWholeWord ?? options.baseMatchWholeWord;

            const searchMatches: SearchMatch[] = [];
            const sidOccurrenceMap = new Map<string, number>();
            editor.read(() => {
                const root = $getRoot();
                root.getAllTextNodes().forEach((node) => {
                    const text = node.getTextContent();
                    const sid = $isUSFMTextNode(node)
                        ? node.getSid()
                        : undefined;

                    if (effectiveMatchWholeWord) {
                        const escapedTerm = escapeRegex(activeSearchTerm);
                        const regex = new RegExp(
                            `\\b${escapedTerm}\\b`,
                            effectiveMatchCase ? "g" : "gi",
                        );

                        let match: RegExpExecArray | null;
                        // biome-ignore lint/suspicious/noAssignInExpressions: intentional assignment in while condition
                        while ((match = regex.exec(text)) !== null) {
                            const sidOccurrenceIndex = sid
                                ? (sidOccurrenceMap.get(sid) ?? 0)
                                : undefined;
                            if (sid) {
                                sidOccurrenceMap.set(
                                    sid,
                                    (sidOccurrenceIndex ?? 0) + 1,
                                );
                            }
                            searchMatches.push({
                                node,
                                start: match.index,
                                end: match.index + match[0].length,
                                source,
                                sid,
                                sidOccurrenceIndex,
                            });
                        }
                    } else {
                        const textToSearch = effectiveMatchCase
                            ? text
                            : text.toLowerCase();
                        const termToSearch = effectiveMatchCase
                            ? activeSearchTerm
                            : activeSearchTerm.toLowerCase();

                        let index = textToSearch.indexOf(termToSearch);
                        while (index !== -1) {
                            const sidOccurrenceIndex = sid
                                ? (sidOccurrenceMap.get(sid) ?? 0)
                                : undefined;
                            if (sid) {
                                sidOccurrenceMap.set(
                                    sid,
                                    (sidOccurrenceIndex ?? 0) + 1,
                                );
                            }
                            searchMatches.push({
                                node,
                                start: index,
                                end: index + activeSearchTerm.length,
                                source,
                                sid,
                                sidOccurrenceIndex,
                            });
                            index = textToSearch.indexOf(
                                termToSearch,
                                index + 1,
                            );
                        }
                    }
                });
            });
            return searchMatches;
        },
        [],
    );

    const collectMatchesInCurrentEditor = useCallback(
        (
            activeSearchTerm: string,
            options: SearchRunOptionOverrides & {
                baseMatchCase: boolean;
                baseMatchWholeWord: boolean;
            },
        ) => {
            const editor = editorRef.current;
            if (!editor) return [];
            return collectMatchesInEditor(
                editor,
                "target",
                activeSearchTerm,
                options,
            );
        },
        [collectMatchesInEditor, editorRef],
    );

    const pick = useCallback(
        (
            result: SearchResult,
            args: {
                activeSearchTerm: string;
                searchReference: boolean;
                matchCase: boolean;
                matchWholeWord: boolean;
            },
        ) => {
            clearHighlights();
            setPickedResult(result);

            const newChapterState = switchBookOrChapter(
                result.bibleIdentifier,
                result.chapNum,
            );
            if (!newChapterState) return;

            queueMicrotask(() => {
                const targetEditor = editorRef.current;
                if (!targetEditor) return;

                if (args.searchReference || result.source === "reference") {
                    const targetMatches = collectMatchesInEditor(
                        targetEditor,
                        "target",
                        args.activeSearchTerm,
                        {
                            baseMatchCase: args.matchCase,
                            baseMatchWholeWord: args.matchWholeWord,
                        },
                    );
                    const referenceEditor = referenceEditorRef.current;
                    const referenceMatches = referenceEditor
                        ? collectMatchesInEditor(
                              referenceEditor,
                              "reference",
                              args.activeSearchTerm,
                              {
                                  baseMatchCase: args.matchCase,
                                  baseMatchWholeWord: args.matchWholeWord,
                              },
                          )
                        : [];
                    const nextMatches = [...targetMatches, ...referenceMatches];
                    setCurrentMatches(nextMatches);

                    const activeTargetMatch = targetMatches.find(
                        (m) =>
                            m.sid === result.sid &&
                            m.sidOccurrenceIndex === result.sidOccurrenceIndex,
                    );
                    const activeReferenceMatch = referenceMatches.find(
                        (m) =>
                            m.sid === result.sid &&
                            m.sidOccurrenceIndex === result.sidOccurrenceIndex,
                    );

                    const activeMatch =
                        activeTargetMatch ?? activeReferenceMatch ?? undefined;
                    setCurrentMatchIndex(
                        activeMatch ? nextMatches.indexOf(activeMatch) : 0,
                    );

                    highlightMatchesAcrossEditors([
                        {
                            editor: targetEditor,
                            matches: targetMatches,
                            activeMatch: activeTargetMatch,
                        },
                        ...(referenceEditor
                            ? [
                                  {
                                      editor: referenceEditor,
                                      matches: referenceMatches,
                                      activeMatch: activeReferenceMatch,
                                  },
                              ]
                            : []),
                    ]);
                    return;
                }

                const searchMatches = collectMatchesInCurrentEditor(
                    args.activeSearchTerm,
                    {
                        baseMatchCase: args.matchCase,
                        baseMatchWholeWord: args.matchWholeWord,
                    },
                );
                setCurrentMatches(searchMatches);

                let activeMatch: SearchMatch | undefined;
                if (searchMatches.length > 0) {
                    const matchForResult = searchMatches.find(
                        (m) =>
                            m.sid === result.sid &&
                            m.sidOccurrenceIndex === result.sidOccurrenceIndex,
                    );

                    if (matchForResult) {
                        activeMatch = matchForResult;
                        setCurrentMatchIndex(
                            searchMatches.indexOf(matchForResult),
                        );
                    }
                }

                highlightMatches(searchMatches, targetEditor, activeMatch);
            });
        },
        [
            collectMatchesInCurrentEditor,
            collectMatchesInEditor,
            editorRef,
            referenceEditorRef,
            switchBookOrChapter,
        ],
    );

    const getPickedResultIdx = useCallback(
        (results: SearchResult[]) =>
            pickedResult ? results.indexOf(pickedResult) : -1,
        [pickedResult],
    );

    const nextMatch = useCallback(
        (
            results: SearchResult[],
            args: {
                activeSearchTerm: string;
                searchReference: boolean;
                matchCase: boolean;
                matchWholeWord: boolean;
            },
        ) => {
            const pickedResultIdx = getPickedResultIdx(results);
            if (
                !pickedResult ||
                pickedResultIdx === -1 ||
                pickedResultIdx === results.length - 1
            ) {
                const first = results[0];
                if (!first) return;
                return pick(first, args);
            }

            const next = results[pickedResultIdx + 1];
            if (!next) return;
            return pick(next, args);
        },
        [getPickedResultIdx, pick, pickedResult],
    );

    const prevMatch = useCallback(
        (
            results: SearchResult[],
            args: {
                activeSearchTerm: string;
                searchReference: boolean;
                matchCase: boolean;
                matchWholeWord: boolean;
            },
        ) => {
            const pickedResultIdx = getPickedResultIdx(results);
            if (!pickedResultIdx || pickedResultIdx === 0) {
                const last = results[results.length - 1];
                if (!last) return;
                return pick(last, args);
            }
            const prev = results[pickedResultIdx - 1];
            if (!prev) return;
            return pick(prev, args);
        },
        [getPickedResultIdx, pick],
    );

    function findMatchIndex(target: MatchInNode) {
        return currentMatches.findIndex(
            (candidate) =>
                candidate.node.getKey() === target.node.getKey() &&
                candidate.start === target.start &&
                candidate.end === target.end,
        );
    }

    return {
        currentMatches,
        setCurrentMatches,
        currentMatchIndex,
        setCurrentMatchIndex,
        pickedResult,
        setPickedResult,
        collectMatchesInCurrentEditor,
        pick,
        nextMatch,
        prevMatch,
        getPickedResultIdx,
        findMatchIndex,
    };
}
