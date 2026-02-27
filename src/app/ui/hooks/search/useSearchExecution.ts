import { useDebouncedCallback } from "@mantine/hooks";
import type { LexicalEditor } from "lexical";
import {
    type MutableRefObject,
    type RefObject,
    useCallback,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import {
    alignTargetResultsToReferenceOrder,
    applySort,
    buildPairKey,
    dedupeByVerse,
    pairReferenceResultsToTarget,
    type SortOption,
} from "@/app/domain/search/SearchProjectionService.ts";
import {
    buildSearchChapters,
    buildTargetSidTextLookup,
    chapterKey,
    findChapter,
    listChapterKeys,
    runSearch,
    type SearchContentProvider,
    type SearchResult,
} from "@/app/domain/search/SearchService.ts";
import type {
    SearchMatch,
    SearchRunOptionOverrides,
    SearchRunResult,
    SearchRunScope,
} from "@/app/ui/hooks/search/searchTypes.ts";
import {
    clearHighlights,
    highlightMatches,
} from "@/app/ui/hooks/useSearchHighlighter.ts";
import type { SearchQuery } from "@/core/domain/search/types.ts";

type Params = {
    resolvedContentProvider: SearchContentProvider;
    pickedFile: ParsedFile;
    pickedChapter?: ParsedChapter;
    currentChapterSid: string;
    editorRef: RefObject<LexicalEditor | null>;
    collectMatchesInCurrentEditor: (
        activeSearchTerm: string,
        options: SearchRunOptionOverrides & {
            baseMatchCase: boolean;
            baseMatchWholeWord: boolean;
        },
    ) => SearchMatch[];
    pick: (
        result: SearchResult,
        args: {
            activeSearchTerm: string;
            searchReference: boolean;
            matchCase: boolean;
            matchWholeWord: boolean;
        },
    ) => void;
    currentMatchesControls: {
        setCurrentMatches: (value: SearchMatch[]) => void;
        setCurrentMatchIndex: (value: number) => void;
        setPickedResult: (value: SearchResult | null) => void;
        pickedResult: SearchResult | null;
        currentMatchIndex: number;
    };
};

function resetSearchUiState(args: {
    searchAbortController: MutableRefObject<AbortController | null>;
    setTargetResults: (value: SearchResult[]) => void;
    setReferenceResults: (value: SearchResult[]) => void;
    setCurrentMatches: (value: SearchMatch[]) => void;
    setCurrentMatchIndex: (value: number) => void;
    setPickedResult: (value: SearchResult | null) => void;
    setIsSearching: (value: boolean) => void;
}) {
    if (args.searchAbortController.current) {
        args.searchAbortController.current.abort();
    }
    clearHighlights();
    args.setTargetResults([]);
    args.setReferenceResults([]);
    args.setCurrentMatches([]);
    args.setCurrentMatchIndex(0);
    args.setPickedResult(null);
    args.setIsSearching(false);
}

export function useSearchExecution({
    resolvedContentProvider,
    pickedFile,
    pickedChapter,
    currentChapterSid,
    editorRef,
    collectMatchesInCurrentEditor,
    pick,
    currentMatchesControls,
}: Params) {
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [isSearching, setIsSearching] = useState(false);
    const [targetResults, setTargetResults] = useState<SearchResult[]>([]);
    const [referenceResults, setReferenceResults] = useState<SearchResult[]>(
        [],
    );
    const [currentSort, setCurrentSort] = useState<SortOption>("canonical");
    const [isSearchPaneOpen, setIsSearchPaneOpen] = useState(false);
    const [matchWholeWord, setMatchWholeWordState] = useState(false);
    const [matchCase, setMatchCaseState] = useState(false);
    const [searchUSFM, setSearchUSFMState] = useState(false);
    const [searchReference, setSearchReferenceState] = useState(false);

    const searchAbortController = useRef<AbortController | null>(null);

    const hasReferenceSearchAvailable = Boolean(
        resolvedContentProvider.getReferenceFiles().length,
    );

    const results = useMemo(
        () =>
            searchReference && hasReferenceSearchAvailable
                ? referenceResults
                : targetResults,
        [
            hasReferenceSearchAvailable,
            referenceResults,
            searchReference,
            targetResults,
        ],
    );

    const sortBy = useCallback(
        (option: SortOption) => {
            setCurrentSort(option);

            const currentlySelected =
                currentMatchesControls.pickedResult ??
                results[currentMatchesControls.currentMatchIndex] ??
                null;

            let sortedTargetResults = applySort(targetResults, option);
            let sortedReferenceResults = applySort(referenceResults, option);

            if (searchReference && hasReferenceSearchAvailable) {
                sortedReferenceResults = applySort(referenceResults, option);
                sortedTargetResults = alignTargetResultsToReferenceOrder({
                    referenceResults: sortedReferenceResults,
                    unsortedTargetResults: targetResults,
                });
            }

            const sortedResults: SearchResult[] =
                searchReference && hasReferenceSearchAvailable
                    ? sortedReferenceResults
                    : sortedTargetResults;

            setTargetResults(sortedTargetResults);
            setReferenceResults(sortedReferenceResults);

            if (currentlySelected) {
                const newIndex = sortedResults.findIndex(
                    (r) =>
                        r.sid === currentlySelected.sid &&
                        r.naturalIndex === currentlySelected.naturalIndex &&
                        r.source === currentlySelected.source &&
                        buildPairKey(r) === buildPairKey(currentlySelected),
                );
                currentMatchesControls.setCurrentMatchIndex(
                    newIndex !== -1 ? newIndex : 0,
                );
            }
        },
        [
            currentMatchesControls,
            hasReferenceSearchAvailable,
            referenceResults,
            results,
            searchReference,
            targetResults,
        ],
    );

    const runSearchLogic = useCallback(
        async (
            query: string,
            options: {
                autoPick?: boolean;
                scope?: SearchRunScope;
                overrides?: SearchRunOptionOverrides;
            } = {},
        ): Promise<SearchRunResult | null> => {
            const {
                autoPick = true,
                scope = "project",
                overrides = {},
            } = options;
            const effectiveMatchCase = overrides.matchCase ?? matchCase;
            const effectiveMatchWholeWord =
                overrides.matchWholeWord ?? matchWholeWord;
            const effectiveSearchUSFM = overrides.searchUSFM ?? searchUSFM;
            const effectiveSearchReference =
                overrides.searchReference ?? searchReference;

            if (searchAbortController.current) {
                searchAbortController.current.abort();
            }

            const controller = new AbortController();
            searchAbortController.current = controller;
            const signal = controller.signal;

            if (!query.trim()) {
                setTargetResults([]);
                setReferenceResults([]);
                setIsSearching(false);
                return {
                    sortedResults: [],
                    searchMatches: [],
                };
            }

            setIsSearching(true);

            const searchResultsContainer = document.querySelector(
                '[data-js="search-results-scroll-container"]',
            );
            if (searchResultsContainer) {
                searchResultsContainer.scrollTop = 0;
            }

            if (signal.aborted) return null;

            clearHighlights();

            const targetFilesToSearch =
                resolvedContentProvider.saveDirtyAndGetTargetFiles();
            const targetChapterKeySet = listChapterKeys(targetFilesToSearch);
            const queryOptions: SearchQuery = {
                term: query,
                matchCase: effectiveMatchCase,
                wholeWord: effectiveMatchWholeWord,
            };

            let nextTargetResults = targetResults;
            let nextReferenceResults = referenceResults;

            if (scope === "currentChapter") {
                if (effectiveSearchReference && hasReferenceSearchAvailable) {
                    const sidToText = buildTargetSidTextLookup({
                        files: targetFilesToSearch,
                        searchUSFM: effectiveSearchUSFM,
                    });
                    nextReferenceResults = referenceResults;
                    nextTargetResults = pairReferenceResultsToTarget({
                        referenceResults: nextReferenceResults,
                        targetSidText: sidToText,
                    });
                } else {
                    const currentBookId = pickedFile.bookCode;
                    const currentChapNum = pickedChapter?.chapNumber ?? 1;
                    const targetChapter = findChapter(targetFilesToSearch, {
                        bookCode: currentBookId,
                        chapterNum: currentChapNum,
                    });
                    const chapterResults = targetChapter
                        ? runSearch({
                              chapters: buildSearchChapters({
                                  files: targetFilesToSearch,
                                  searchUSFM: effectiveSearchUSFM,
                                  restrictToChapterKeys: new Set<string>([
                                      chapterKey(currentBookId, currentChapNum),
                                  ]),
                              }),
                              query: queryOptions,
                              source: "target",
                          })
                        : [];
                    const dedupedChapterResults = dedupeByVerse(chapterResults);
                    const untouchedResults = targetResults.filter(
                        (result) =>
                            !(
                                result.bibleIdentifier === currentBookId &&
                                result.chapNum === currentChapNum
                            ),
                    );
                    nextTargetResults = [
                        ...untouchedResults,
                        ...dedupedChapterResults,
                    ];
                    nextReferenceResults = [];
                }
            } else {
                if (effectiveSearchReference && hasReferenceSearchAvailable) {
                    const rawReferenceResults = runSearch({
                        chapters: buildSearchChapters({
                            files: resolvedContentProvider.getReferenceFiles(),
                            searchUSFM: effectiveSearchUSFM,
                            restrictToChapterKeys: targetChapterKeySet,
                        }),
                        query: queryOptions,
                        source: "reference",
                    });
                    nextReferenceResults = dedupeByVerse(rawReferenceResults);

                    const sidToText = buildTargetSidTextLookup({
                        files: targetFilesToSearch,
                        searchUSFM: effectiveSearchUSFM,
                    });
                    nextTargetResults = pairReferenceResultsToTarget({
                        referenceResults: nextReferenceResults,
                        targetSidText: sidToText,
                    });
                } else {
                    nextTargetResults = runSearch({
                        chapters: buildSearchChapters({
                            files: targetFilesToSearch,
                            searchUSFM: effectiveSearchUSFM,
                        }),
                        query: queryOptions,
                        source: "target",
                    });
                    nextTargetResults = dedupeByVerse(nextTargetResults);
                    nextReferenceResults = [];
                }
            }

            if (signal.aborted) return null;

            let sortedTargetResults = applySort(nextTargetResults, currentSort);
            let sortedReferenceResults = applySort(
                nextReferenceResults,
                currentSort,
            );
            let sortedResults = sortedTargetResults;

            if (effectiveSearchReference && hasReferenceSearchAvailable) {
                sortedReferenceResults = applySort(
                    nextReferenceResults,
                    currentSort,
                );
                sortedTargetResults = alignTargetResultsToReferenceOrder({
                    referenceResults: sortedReferenceResults,
                    unsortedTargetResults: nextTargetResults,
                });
                sortedResults = sortedReferenceResults;
            }

            setTargetResults(sortedTargetResults);
            setReferenceResults(sortedReferenceResults);

            if (!autoPick) {
                const searchMatches = effectiveSearchReference
                    ? []
                    : collectMatchesInCurrentEditor(query, {
                          ...overrides,
                          baseMatchCase: effectiveMatchCase,
                          baseMatchWholeWord: effectiveMatchWholeWord,
                      });
                currentMatchesControls.setCurrentMatches(searchMatches);
                currentMatchesControls.setCurrentMatchIndex(0);
                currentMatchesControls.setPickedResult(null);
                const editor = editorRef.current;
                if (editor && !effectiveSearchReference) {
                    highlightMatches(searchMatches, editor);
                }
                setIsSearching(false);
                return {
                    sortedResults,
                    searchMatches,
                };
            }

            const firstInThisChap = sortedResults.findIndex((r) =>
                r.sid.startsWith(currentChapterSid),
            );
            if (firstInThisChap !== -1) {
                currentMatchesControls.setCurrentMatchIndex(firstInThisChap);
                pick(sortedResults[firstInThisChap], {
                    activeSearchTerm: query,
                    searchReference: effectiveSearchReference,
                    matchCase: effectiveMatchCase,
                    matchWholeWord: effectiveMatchWholeWord,
                });
            } else {
                currentMatchesControls.setCurrentMatchIndex(0);
                currentMatchesControls.setPickedResult(null);
            }

            setIsSearching(false);
            return {
                sortedResults,
                searchMatches: [],
            };
        },
        [
            collectMatchesInCurrentEditor,
            currentChapterSid,
            currentMatchesControls,
            currentSort,
            editorRef,
            hasReferenceSearchAvailable,
            matchCase,
            matchWholeWord,
            pick,
            pickedChapter?.chapNumber,
            pickedFile.bookCode,
            referenceResults,
            resolvedContentProvider,
            searchReference,
            searchUSFM,
            targetResults,
        ],
    );

    const handleSearchDebounced = useDebouncedCallback((query: string) => {
        void runSearchLogic(query);
    }, 500);

    const onSearchChange = useCallback(
        (value: string) => {
            setSearchTerm(value);

            if (!value.trim()) {
                resetSearchUiState({
                    searchAbortController,
                    setTargetResults,
                    setReferenceResults,
                    setCurrentMatches: currentMatchesControls.setCurrentMatches,
                    setCurrentMatchIndex:
                        currentMatchesControls.setCurrentMatchIndex,
                    setPickedResult: currentMatchesControls.setPickedResult,
                    setIsSearching,
                });
                return;
            }

            const searchResultsContainer = document.querySelector(
                '[data-js="search-results-scroll-container"]',
            );
            if (searchResultsContainer) {
                searchResultsContainer.scrollTop = 0;
            }

            handleSearchDebounced(value);
        },
        [currentMatchesControls, handleSearchDebounced],
    );

    const submitSearchNow = useCallback(() => {
        const query = searchTerm.trim();
        if (!query) {
            resetSearchUiState({
                searchAbortController,
                setTargetResults,
                setReferenceResults,
                setCurrentMatches: currentMatchesControls.setCurrentMatches,
                setCurrentMatchIndex:
                    currentMatchesControls.setCurrentMatchIndex,
                setPickedResult: currentMatchesControls.setPickedResult,
                setIsSearching,
            });
            return;
        }
        void runSearchLogic(searchTerm);
    }, [currentMatchesControls, runSearchLogic, searchTerm]);

    const rerunForCurrentChapter = useCallback(() => {
        if (!isSearchPaneOpen) return;
        if (!searchTerm.trim()) return;
        setTimeout(() => {
            void runSearchLogic(searchTerm, {
                autoPick: false,
                scope: "currentChapter",
            });
        }, 0);
    }, [isSearchPaneOpen, runSearchLogic, searchTerm]);

    const setMatchCase = useCallback(
        (next: boolean) => {
            setMatchCaseState(next);
            if (searchTerm.trim()) {
                void runSearchLogic(searchTerm, {
                    autoPick: false,
                    scope: "project",
                    overrides: { matchCase: next },
                });
            }
        },
        [runSearchLogic, searchTerm],
    );

    const setMatchWholeWord = useCallback(
        (next: boolean) => {
            setMatchWholeWordState(next);
            if (searchTerm.trim()) {
                void runSearchLogic(searchTerm, {
                    autoPick: false,
                    scope: "project",
                    overrides: { matchWholeWord: next },
                });
            }
        },
        [runSearchLogic, searchTerm],
    );

    const setSearchUSFM = useCallback(
        (next: boolean) => {
            setSearchUSFMState(next);
            if (searchTerm.trim()) {
                void runSearchLogic(searchTerm, {
                    autoPick: false,
                    scope: "project",
                    overrides: { searchUSFM: next },
                });
            }
        },
        [runSearchLogic, searchTerm],
    );

    const setSearchReference = useCallback(
        (next: boolean) => {
            if (!hasReferenceSearchAvailable) {
                setSearchReferenceState(false);
                return;
            }
            setSearchReferenceState(next);
            if (searchTerm.trim()) {
                void runSearchLogic(searchTerm, {
                    autoPick: false,
                    scope: "project",
                    overrides: { searchReference: next },
                });
            }
        },
        [hasReferenceSearchAvailable, runSearchLogic, searchTerm],
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

    return {
        searchTerm,
        isSearching,
        targetResults,
        referenceResults,
        currentSort,
        isSearchPaneOpen,
        matchWholeWord,
        matchCase,
        searchUSFM,
        searchReference,
        hasReferenceSearchAvailable,
        results,
        onSearchChange,
        submitSearchNow,
        rerunForCurrentChapter,
        sortBy,
        setMatchCase,
        setMatchWholeWord,
        setSearchUSFM,
        setSearchReference,
        setSearchPaneOpen,
        runSearchLogic,
        setSearchReferenceState,
        setTargetResults,
        setReferenceResults,
    };
}
