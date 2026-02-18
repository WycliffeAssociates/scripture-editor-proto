import { useDebouncedCallback } from "@mantine/hooks";
import { $getRoot, type LexicalEditor, type LexicalNode } from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { walkChapters } from "@/app/domain/editor/utils/serializedTraversal.ts";
import {
    escapeRegex,
    findAllMatches,
    reduceSerializedNodesToText,
    replaceMatchesInText,
} from "@/app/domain/search/search.utils.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import {
    clearHighlights,
    highlightMatches,
    type MatchInNode,
} from "@/app/ui/hooks/useSearchHighlighter.ts";
import {
    makeSid,
    type ParsedReference,
    parseSid,
    sortListBySidCanonical,
} from "@/core/data/bible/bible.ts";

type Props = {
    workingFiles: ParsedFile[];
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
    switchBookOrChapter: (
        file: string,
        chapter: number,
    ) => ParsedChapter | undefined;
    editorRef: React.RefObject<LexicalEditor | null>;
    pickedFile: ParsedFile;
    pickedChapter?: ParsedChapter;
    history: CustomHistoryHook;
};

type SearchResult = {
    sid: string;
    sidOccurrenceIndex: number;
    text: string;
    bibleIdentifier: string;
    chapNum: number;
    parsedSid: ParsedReference | null;
    isCaseMismatch: boolean;
    naturalIndex: number;
};

type SearchMatch = MatchInNode & {
    sid?: string;
    sidOccurrenceIndex?: number;
};

type SearchRunResult = {
    sortedResults: SearchResult[];
    searchMatches: SearchMatch[];
};
type SearchRunScope = "project" | "currentChapter";
export type SortOption = "canonical" | "caseMismatch";

export type UseSearchReturn = ReturnType<typeof useProjectSearch> & {
    searchUSFM: boolean;
    setSearchUSFM: (value: boolean) => void;
};

export function useProjectSearch({
    workingFiles,
    saveCurrentDirtyLexical,
    switchBookOrChapter,
    editorRef,
    pickedFile,
    pickedChapter,
    history,
}: Props) {
    // Input State
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [replaceTerm, setReplaceTerm] = useState<string>("");

    // Search Execution State
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [currentSort, setCurrentSort] = useState<SortOption>("canonical");

    // Abort Controller Ref
    const searchAbortController = useRef<AbortController | null>(null);

    // Navigation/Highlight State
    const [currentMatches, setCurrentMatches] = useState<MatchInNode[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
    const [pickedResult, setPickedResult] = useState<SearchResult | null>(null);

    // Settings / UI State
    const [isSearchPaneOpen, setIsSearchPaneOpen] = useState(false);
    const [matchWholeWord, setMatchWholeWordState] = useState(false);
    const [matchCase, setMatchCaseState] = useState(false);
    const [searchUSFM, setSearchUSFMState] = useState(false);

    const currentChapterSid = makeSid({
        bookId: pickedFile.bookCode,
        chapter: pickedChapter?.chapNumber || 1,
    });

    const collectMatchesInCurrentEditor = useCallback(
        (activeSearchTerm: string) => {
            const editor = editorRef.current;
            if (!editor) return [];

            const searchMatches: SearchMatch[] = [];
            const sidOccurrenceMap = new Map<string, number>();
            editor.read(() => {
                const root = $getRoot();
                root.getAllTextNodes().forEach((node) => {
                    const text = node.getTextContent();
                    const sid = $isUSFMTextNode(node)
                        ? node.getSid()
                        : undefined;

                    if (matchWholeWord) {
                        const escapedTerm = escapeRegex(activeSearchTerm);
                        const regex = new RegExp(
                            `\\b${escapedTerm}\\b`,
                            matchCase ? "g" : "gi",
                        );

                        let match: RegExpExecArray | null;
                        // biome-ignore lint/suspicious/noAssignInExpressions: Intentional assignment in while condition
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
                                sid,
                                sidOccurrenceIndex,
                            });
                        }
                    } else {
                        const textToSearch = matchCase
                            ? text
                            : text.toLowerCase();
                        const termToSearch = matchCase
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
        [editorRef, matchCase, matchWholeWord],
    );

    const applySort = useCallback(
        (items: SearchResult[], sortOption: SortOption) => {
            const copy = [...items];
            if (sortOption === "canonical") {
                sortListBySidCanonical(copy);
                return copy;
            } else if (sortOption === "caseMismatch") {
                copy.sort((a, b) => {
                    // Sort Mismatches (true) to the top
                    if (a.isCaseMismatch !== b.isCaseMismatch) {
                        return a.isCaseMismatch ? -1 : 1;
                    }
                    return 0;
                });
                return copy;
            } else {
                return copy;
            }
        },
        [],
    );
    // --- Public Sort Function ---
    function sortBy(option: SortOption) {
        setCurrentSort(option);

        // We must track the currently selected item to prevent jumpiness
        const currentlySelected = results[currentMatchIndex];

        const sortedResults = applySort(results, option);
        setResults(sortedResults);

        // If we had a selection, find where it moved to in the new list
        if (currentlySelected) {
            const newIndex = sortedResults.findIndex(
                (r) =>
                    r.sid === currentlySelected.sid &&
                    r.naturalIndex === currentlySelected.naturalIndex,
            );
            if (newIndex !== -1) {
                setCurrentMatchIndex(newIndex);
            } else {
                setCurrentMatchIndex(0);
            }
        }
    }

    const pick = useCallback(
        (result: SearchResult, activeSearchTerm = searchTerm) => {
            clearHighlights();
            setPickedResult(result);

            const newChapterState = switchBookOrChapter(
                result.bibleIdentifier,
                result.chapNum,
            );
            if (!newChapterState) return;

            queueMicrotask(() => {
                const editor = editorRef.current;
                if (!editor) return;

                const searchMatches =
                    collectMatchesInCurrentEditor(activeSearchTerm);
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

                highlightMatches(searchMatches, editor, activeMatch);
            });
        },
        [
            collectMatchesInCurrentEditor,
            editorRef,
            searchTerm,
            switchBookOrChapter,
        ],
    );

    // The heavy lifting logic
    const runSearchLogic = useCallback(
        async (
            query: string,
            options: { autoPick?: boolean; scope?: SearchRunScope } = {},
        ): Promise<SearchRunResult | null> => {
            const { autoPick = true, scope = "project" } = options;
            // 1. Abort previous search
            if (searchAbortController.current) {
                searchAbortController.current.abort();
            }

            // 2. Create new controller for this specific run
            const controller = new AbortController();
            searchAbortController.current = controller;
            const signal = controller.signal;

            if (!query.trim()) {
                setResults([]);
                setIsSearching(false);
                return {
                    sortedResults: [],
                    searchMatches: [],
                };
            }

            setIsSearching(true);

            // Scroll search results container to top when new search starts
            const searchResultsContainer = document.querySelector(
                '[data-js="search-results-scroll-container"]',
            );
            if (searchResultsContainer) {
                searchResultsContainer.scrollTop = 0;
            }

            // Check immediately after yield
            if (signal.aborted) return null;

            clearHighlights();

            const filesToSearch = saveCurrentDirtyLexical() || workingFiles;
            const allResults: SearchResult[] = [];
            let naturalIndex = 0;

            const collectChapterResults = (
                file: ParsedFile,
                chapter: ParsedChapter,
            ) => {
                const chapterResults: SearchResult[] = [];
                const serializedNodes = chapter.lexicalState.root.children;
                const sidRecord = reduceSerializedNodesToText(
                    serializedNodes,
                    searchUSFM,
                );

                for (const [sid, text] of Object.entries(sidRecord)) {
                    const matches = findAllMatches({
                        matchCase,
                        searchTerm: query,
                        matchWholeWord,
                        textToSearch: text,
                    });
                    for (
                        let sidOccurrenceIndex = 0;
                        sidOccurrenceIndex < matches.length;
                        sidOccurrenceIndex++
                    ) {
                        const matchResult = matches[sidOccurrenceIndex];
                        chapterResults.push({
                            sid,
                            sidOccurrenceIndex,
                            text,
                            bibleIdentifier: file.bookCode,
                            chapNum: chapter.chapNumber,
                            parsedSid: parseSid(sid),
                            isCaseMismatch: query !== matchResult.matchedTerm,
                            naturalIndex,
                        });
                        naturalIndex++;
                    }
                }

                return chapterResults;
            };

            if (scope === "currentChapter") {
                const currentBookId = pickedFile.bookCode;
                const currentChapNum = pickedChapter?.chapNumber ?? 1;
                const targetFile = filesToSearch.find(
                    (file) => file.bookCode === currentBookId,
                );
                const targetChapter = targetFile?.chapters.find(
                    (chapter) => chapter.chapNumber === currentChapNum,
                );

                if (targetFile && targetChapter) {
                    allResults.push(
                        ...collectChapterResults(targetFile, targetChapter),
                    );
                }
            } else {
                // --- Heavy Synchronous Loop ---
                for (const { file, chapter } of walkChapters(filesToSearch)) {
                    // Check abort signal between files to break the heavy loop
                    if (signal.aborted) return null;
                    allResults.push(...collectChapterResults(file, chapter));
                }
                // ------------------------------
            }

            // Final safety check before state update
            if (signal.aborted) return null;
            let nextResults = allResults;
            if (scope === "currentChapter") {
                const currentBookId = pickedFile.bookCode;
                const currentChapNum = pickedChapter?.chapNumber ?? 1;
                const untouchedResults = results.filter(
                    (result) =>
                        !(
                            result.bibleIdentifier === currentBookId &&
                            result.chapNum === currentChapNum
                        ),
                );
                nextResults = [...untouchedResults, ...allResults];
            }
            const sortedResults = applySort(nextResults, currentSort);

            setResults(sortedResults);

            if (!autoPick) {
                const searchMatches = collectMatchesInCurrentEditor(query);
                setCurrentMatches(searchMatches);
                setCurrentMatchIndex(0);
                setPickedResult(null);
                const editor = editorRef.current;
                if (editor) {
                    highlightMatches(searchMatches, editor);
                }
                setIsSearching(false);
                return {
                    sortedResults,
                    searchMatches,
                };
            }

            // Auto-select logic
            const firstInThisChap = sortedResults.findIndex((r) =>
                r.sid.startsWith(currentChapterSid),
            );
            if (firstInThisChap !== -1) {
                setCurrentMatchIndex(firstInThisChap);
                pick(sortedResults[firstInThisChap], query);
            } else {
                setCurrentMatchIndex(0);
                setPickedResult(null);
            }

            setIsSearching(false);
            return {
                sortedResults,
                searchMatches: [],
            };
        },
        [
            applySort,
            collectMatchesInCurrentEditor,
            currentChapterSid,
            currentSort,
            editorRef,
            matchCase,
            matchWholeWord,
            pick,
            pickedChapter?.chapNumber,
            pickedFile.bookCode,
            results,
            saveCurrentDirtyLexical,
            searchUSFM,
            workingFiles,
        ],
    );

    // The debounced callback exposed to the UI
    const handleSearchDebounced = useDebouncedCallback((query: string) => {
        void runSearchLogic(query);
    }, 500);

    const onSearchChange = (value: string) => {
        setSearchTerm(value);

        if (!value.trim()) {
            if (searchAbortController.current) {
                searchAbortController.current.abort();
            }
            clearHighlights();
            setResults([]);
            setCurrentMatches([]);
            setCurrentMatchIndex(0);
            setPickedResult(null);
            setIsSearching(false);
            return;
        }

        // Scroll search results container to top when search term changes
        const searchResultsContainer = document.querySelector(
            '[data-js="search-results-scroll-container"]',
        );
        if (searchResultsContainer) {
            searchResultsContainer.scrollTop = 0;
        }

        handleSearchDebounced(value);
    };

    const rerunForCurrentChapter = useCallback(() => {
        if (!searchTerm.trim()) return;
        setTimeout(() => {
            void runSearchLogic(searchTerm, {
                autoPick: false,
                scope: "currentChapter",
            });
        }, 0);
    }, [runSearchLogic, searchTerm]);

    const setMatchCase = useCallback(
        (next: boolean) => {
            setMatchCaseState(next);
            if (searchTerm.trim()) {
                void runSearchLogic(searchTerm, { autoPick: false });
            }
        },
        [runSearchLogic, searchTerm],
    );

    const setMatchWholeWord = useCallback(
        (next: boolean) => {
            setMatchWholeWordState(next);
            if (searchTerm.trim()) {
                void runSearchLogic(searchTerm, { autoPick: false });
            }
        },
        [runSearchLogic, searchTerm],
    );

    const setSearchUSFM = useCallback(
        (next: boolean) => {
            setSearchUSFMState(next);
            if (searchTerm.trim()) {
                void runSearchLogic(searchTerm, { autoPick: false });
            }
        },
        [runSearchLogic, searchTerm],
    );

    const setSearchPaneOpen = useCallback(
        (next: boolean | ((prevState: boolean) => boolean)) => {
            setIsSearchPaneOpen((prev) => {
                const resolved = typeof next === "function" ? next(prev) : next;
                if (resolved && searchTerm.trim()) {
                    void runSearchLogic(searchTerm, {
                        autoPick: false,
                    });
                }
                return resolved;
            });
        },
        [runSearchLogic, searchTerm],
    );
    const pickedResultIdx = pickedResult ? results.indexOf(pickedResult) : -1;

    // Keep search results/highlights synchronized after history replay.
    // Undo/redo can mutate text while the search pane stays open, so we rerun
    // search here to prevent stale counts, result rows, and highlight ranges.
    useEffect(() => {
        return history.registerPostUndoRedoAction(() => {
            if (!isSearchPaneOpen) return;
            if (!searchTerm.trim()) return;
            void runSearchLogic(searchTerm, { autoPick: false });
        });
    }, [history, isSearchPaneOpen, searchTerm, runSearchLogic]);

    // --- Selection / Highlighting Logic ---
    // (Remaining functions stay largely the same)
    function nextMatch() {
        if (
            !pickedResult ||
            pickedResultIdx === -1 ||
            pickedResultIdx === results.length - 1
        )
            return pick(results[0]);

        pick(results[pickedResultIdx + 1]);
        // if (currentMatches.length === 0) return;

        // const nextIndex = (currentMatchIndex + 1) % currentMatches.length;
        // setCurrentMatchIndex(nextIndex);
        // editor.read(() => {
        //   highlightAndScrollToMatch(currentMatches[nextIndex], editor, searchTerm);
        // });
    }

    function prevMatch() {
        if (!pickedResultIdx) return pick(results[results.length - 1]);
        if (pickedResultIdx === 0) return pick(results[results.length - 1]);
        pick(results[pickedResultIdx - 1]);

        // if (currentMatches.length === 0) return;
        // const editor = editorRef.current;
        // if (!editor) return;

        // const prevIndex =
        //   currentMatchIndex === 0
        //     ? currentMatches.length - 1
        //     : currentMatchIndex - 1;
        // setCurrentMatchIndex(prevIndex);
        // editor.read(() => {
        //   highlightAndScrollToMatch(currentMatches[prevIndex], editor, searchTerm);
        // });
    }

    async function replaceCurrentMatch() {
        if (currentMatches.length === 0 || !pickedResult || !replaceTerm)
            return;
        const editor = editorRef.current;
        if (!editor) return;

        const currentMatch = currentMatches[currentMatchIndex];
        history.setNextTypingLabel("Replace (Current Match)");
        editor.update(
            () => {
                const node = currentMatch.node;
                if (!$isUSFMTextNode(node)) return;

                const text = node.getTextContent();
                const newText =
                    text.slice(0, currentMatch.start) +
                    replaceTerm +
                    text.slice(currentMatch.end);

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
        setCurrentMatchIndex(nextIndex);

        if (editorRef.current) {
            highlightMatches(searchMatches, editorRef.current, nextActiveMatch);
        }

        const nextResult = sortedResults.find(
            (r) =>
                r.sid === nextActiveMatch.sid &&
                r.sidOccurrenceIndex === nextActiveMatch.sidOccurrenceIndex &&
                r.bibleIdentifier === pickedFile.bookCode &&
                r.chapNum === pickedChapter?.chapNumber,
        );
        setPickedResult(nextResult ?? null);
    }

    async function replaceAllInChapter() {
        if (!pickedResult || !replaceTerm) return;
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
            setResults([]);
            setCurrentMatches([]);
            setCurrentMatchIndex(0);
            setPickedResult(null);
        }
    }

    const hasNext = results.length > 0;
    const hasPrev = results.length > 0;
    // const hasNext = currentMatches.length > 0 && currentMatches.length > 1;
    // const hasPrev = currentMatches.length > 0 && currentMatches.length > 1;
    return {
        searchTerm,
        onSearchChange,
        isSearching,
        replaceTerm,
        setReplaceTerm,
        results,
        pickedResult,
        pickedResultIdx,
        pickSearchResult: (r: SearchResult) => pick(r, searchTerm),
        nextMatch,
        prevMatch,
        replaceCurrentMatch,
        replaceAllInChapter,
        rerunForCurrentChapter,
        currentMatchIndex,
        totalMatches: currentMatches.length,
        numCaseMismatches: results.filter((r) => r.isCaseMismatch).length,
        hasNext,
        hasPrev,
        isSearchPaneOpen,
        setIsSearchPaneOpen: setSearchPaneOpen,
        matchWholeWord,
        setMatchWholeWord,
        matchCase,
        setMatchCase,
        searchUSFM,
        setSearchUSFM,
        sortBy,
        currentSort,
        escapeRegex,
    };
}
