import { useDebouncedCallback } from "@mantine/hooks";
import { $getRoot, type LexicalEditor } from "lexical";
import { useEffect, useRef, useState } from "react";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    escapeRegex,
    findMatch,
    reduceSerializedNodesToText,
} from "@/app/domain/search/search.utils.ts";
import {
    clearHighlights,
    highlightMatch,
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
    pickedChapter: ParsedChapter;
};

type SearchResult = {
    sid: string;
    text: string;
    bibleIdentifier: string;
    chapNum: number;
    parsedSid: ParsedReference | null;
    isCaseMismatch: boolean;
    naturalIndex: number;
};
export type SortOption = "canonical" | "caseMismatch";

export type UseSearchReturn = ReturnType<typeof useProjectSearch>;

export function useProjectSearch({
    workingFiles,
    saveCurrentDirtyLexical,
    switchBookOrChapter,
    editorRef,
    pickedFile,
    pickedChapter,
}: Props) {
    // Input State
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [replaceTerm, setReplaceTerm] = useState<string>();

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
    const [matchWholeWord, setMatchWholeWord] = useState(false);
    const [matchCase, setMatchCase] = useState(false);

    const currentChapterSid = makeSid({
        bookId: pickedFile.bookCode,
        chapter: pickedChapter.chapNumber,
    });

    // Cleanup on unmount (close)
    useEffect(() => {
        return () => {
            if (searchAbortController.current) {
                searchAbortController.current.abort();
            }
        };
    }, []);

    // Clear highlights when search term is cleared manually
    useEffect(() => {
        if (!searchTerm) {
            // Abort any pending search if input is cleared
            if (searchAbortController.current) {
                searchAbortController.current.abort();
            }
            clearHighlights();
            setResults([]);
            setIsSearching(false);
        }
    }, [searchTerm]);

    // Re-run search if settings change
    // biome-ignore lint/correctness/useExhaustiveDependencies: <just want to rerun when options change>
    useEffect(() => {
        if (searchTerm) {
            runSearchLogic(searchTerm);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchWholeWord, matchCase]);

    const applySort = (items: SearchResult[], sortOption: SortOption) => {
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
    };
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

    // The heavy lifting logic
    const runSearchLogic = async (query: string) => {
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
            return;
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
        if (signal.aborted) return;

        clearHighlights();

        const filesToSearch = saveCurrentDirtyLexical() || workingFiles;
        const allResults: SearchResult[] = [];

        // --- Heavy Synchronous Loop ---
        for (const file of filesToSearch) {
            // Check abort signal between files to break the heavy loop
            if (signal.aborted) return;

            for (const chapter of file.chapters) {
                // Optional: Check between chapters if files are huge
                if (signal.aborted) return;

                const serializedNodes = chapter.lexicalState.root.children;
                const sidRecord = reduceSerializedNodesToText(serializedNodes);

                let naturalIndex = 0;
                for (const [sid, text] of Object.entries(sidRecord)) {
                    const matchResult = findMatch({
                        matchCase,
                        searchTerm: query,
                        matchWholeWord,
                        textToSearch: text,
                    });
                    if (matchResult.isMatch) {
                        allResults.push({
                            sid,
                            text,
                            bibleIdentifier: file.bookCode,
                            chapNum: chapter.chapNumber,
                            parsedSid: parseSid(sid),
                            isCaseMismatch: query !== matchResult.matchedTerm,
                            naturalIndex: naturalIndex,
                        });
                        naturalIndex++;
                    }
                }
            }
        }
        // ------------------------------

        // Final safety check before state update
        if (signal.aborted) return;
        const sortedResults = applySort(allResults, currentSort);
        setResults(sortedResults);

        // Auto-select logic
        const firstInThisChap = sortedResults.findIndex((r) =>
            r.sid.startsWith(currentChapterSid),
        );
        if (firstInThisChap !== -1) {
            setCurrentMatchIndex(firstInThisChap);
            pick(allResults[firstInThisChap], query);
        } else {
            setCurrentMatchIndex(0);
            setPickedResult(null);
        }

        setIsSearching(false);
    };

    // The debounced callback exposed to the UI
    const handleSearchDebounced = useDebouncedCallback((query: string) => {
        runSearchLogic(query);
    }, 500);

    const onSearchChange = (value: string) => {
        setSearchTerm(value);

        // Scroll search results container to top when search term changes
        if (value.trim()) {
            const searchResultsContainer = document.querySelector(
                '[data-js="search-results-scroll-container"]',
            );
            if (searchResultsContainer) {
                searchResultsContainer.scrollTop = 0;
            }
        }

        handleSearchDebounced(value);
    };
    const pickedResultIdx = pickedResult ? results.indexOf(pickedResult) : -1;

    // --- Selection / Highlighting Logic ---
    // (Remaining functions stay largely the same)

    function pick(result: SearchResult, activeSearchTerm = searchTerm) {
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

            editor.read(() => {
                const root = $getRoot();
                const searchMatches: MatchInNode[] = [];

                root.getAllTextNodes().forEach((node) => {
                    const text = node.getTextContent();

                    if (matchWholeWord) {
                        // --- Whole Word Logic (Regex) ---
                        const escapedTerm = escapeRegex(activeSearchTerm);
                        const regex = new RegExp(
                            `\\b${escapedTerm}\\b`,
                            matchCase ? "g" : "gi",
                        );

                        let match: RegExpExecArray | null;
                        // regex.exec is stateful when using 'g' flag
                        // biome-ignore lint/suspicious/noAssignInExpressions: Intentional assignment in while condition
                        while ((match = regex.exec(text)) !== null) {
                            searchMatches.push({
                                node,
                                start: match.index,
                                end: match.index + match[0].length,
                            });
                        }
                    } else {
                        // --- Substring Logic (indexOf) ---
                        const textToSearch = matchCase
                            ? text
                            : text.toLowerCase();
                        const termToSearch = matchCase
                            ? activeSearchTerm
                            : activeSearchTerm.toLowerCase();

                        let index = textToSearch.indexOf(termToSearch);

                        while (index !== -1) {
                            searchMatches.push({
                                node,
                                start: index,
                                end: index + activeSearchTerm.length,
                            });

                            index = textToSearch.indexOf(
                                termToSearch,
                                index + 1,
                            );
                        }
                    }
                });

                setCurrentMatches(searchMatches);

                if (searchMatches.length > 0) {
                    const firstOfSid = searchMatches.find(
                        (m) =>
                            $isUSFMTextNode(m.node) &&
                            m.node.getSid() === result.sid,
                    );

                    if (firstOfSid) {
                        highlightMatch(
                            firstOfSid,
                            editor,
                            activeSearchTerm,
                            matchWholeWord,
                            matchCase,
                        );
                        setCurrentMatchIndex(searchMatches.indexOf(firstOfSid));
                    }
                }
            });
        });
    }

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

    function replaceCurrentMatch() {
        if (currentMatches.length === 0 || !pickedResult) return;
        const editor = editorRef.current;
        if (!editor) return;

        const currentMatch = currentMatches[currentMatchIndex];
        editor.update(() => {
            const node = currentMatch.node;
            if (!$isUSFMTextNode(node)) return;

            const text = node.getTextContent();
            const newText =
                text.slice(0, currentMatch.start) +
                replaceTerm +
                text.slice(currentMatch.end);

            node.setTextContent(newText);
        });

        const updatedResults = results.filter(
            (r) => r.sid !== pickedResult.sid,
        );
        setResults(updatedResults);

        const nextInChapter = updatedResults.find(
            (r) =>
                r.bibleIdentifier === pickedResult.bibleIdentifier &&
                r.chapNum === pickedResult.chapNum &&
                r.parsedSid &&
                pickedResult.parsedSid &&
                r.parsedSid.verseStart >= pickedResult.parsedSid.verseStart,
        );

        if (nextInChapter) {
            pick(nextInChapter);
        } else {
            setCurrentMatches([]);
            setPickedResult(null);
        }
    }

    function replaceAllInChapter() {
        if (!pickedResult || !replaceTerm) return;
        const editor = editorRef.current;
        if (!editor) return;

        editor.update(() => {
            currentMatches.forEach((match) => {
                const node = match.node;
                if (!$isUSFMTextNode(node)) return;
                const text = node.getTextContent();
                const newText = text.replaceAll(searchTerm, replaceTerm);
                node.setTextContent(newText);
            });
        });

        const updatedResults = results.filter(
            (r) =>
                !(
                    r.bibleIdentifier === pickedResult.bibleIdentifier &&
                    r.chapNum === pickedResult.chapNum
                ),
        );
        setResults(updatedResults);
        setCurrentMatches([]);
        setPickedResult(null);
    }

    const hasNext = results.length;
    const hasPrev = results.length;
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
        currentMatchIndex,
        totalMatches: currentMatches.length,
        numCaseMismatches: results.filter((r) => r.isCaseMismatch).length,
        hasNext,
        hasPrev,
        isSearchPaneOpen,
        setIsSearchPaneOpen,
        matchWholeWord,
        setMatchWholeWord,
        matchCase,
        setMatchCase,
        sortBy,
        currentSort,
    };
}
