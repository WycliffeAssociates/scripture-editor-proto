import type { LexicalEditor } from "lexical";
import { type RefObject, useEffect, useMemo } from "react";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import type {
    SearchContentProvider,
    SearchResult,
} from "@/app/domain/search/SearchService.ts";
import { escapeRegex } from "@/app/domain/search/search.utils.ts";
import { useSearchExecution } from "@/app/ui/hooks/search/useSearchExecution.ts";
import { useSearchNavigation } from "@/app/ui/hooks/search/useSearchNavigation.ts";
import { useSearchReplace } from "@/app/ui/hooks/search/useSearchReplace.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { makeSid } from "@/core/data/bible/bible.ts";

type Props = {
    workingFiles: ParsedFile[];
    referenceFiles?: ParsedFile[];
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
    contentProvider?: SearchContentProvider;
    switchBookOrChapter: (
        file: string,
        chapter: number,
    ) => ParsedChapter | undefined;
    editorRef: RefObject<LexicalEditor | null>;
    referenceEditorRef: RefObject<LexicalEditor | null>;
    pickedFile: ParsedFile;
    pickedChapter?: ParsedChapter;
    history: CustomHistoryHook;
};

export type UseSearchReturn = ReturnType<typeof useProjectSearch> & {
    searchUSFM: boolean;
    setSearchUSFM: (value: boolean) => void;
    hasReferenceSearchAvailable: boolean;
    searchReference: boolean;
    setSearchReference: (value: boolean) => void;
};

export function useProjectSearch({
    workingFiles,
    referenceFiles,
    saveCurrentDirtyLexical,
    contentProvider,
    switchBookOrChapter,
    editorRef,
    referenceEditorRef,
    pickedFile,
    pickedChapter,
    history,
}: Props) {
    const resolvedContentProvider: SearchContentProvider = useMemo(
        () =>
            contentProvider ?? {
                getTargetFiles: () => workingFiles,
                saveDirtyAndGetTargetFiles: () =>
                    saveCurrentDirtyLexical() || workingFiles,
                getReferenceFiles: () => referenceFiles ?? [],
            },
        [
            contentProvider,
            referenceFiles,
            saveCurrentDirtyLexical,
            workingFiles,
        ],
    );

    const currentChapterSid = makeSid({
        bookId: pickedFile.bookCode,
        chapter: pickedChapter?.chapNumber || 1,
    });

    const navigation = useSearchNavigation({
        editorRef,
        referenceEditorRef,
        switchBookOrChapter,
    });

    const execution = useSearchExecution({
        resolvedContentProvider,
        pickedFile,
        pickedChapter,
        currentChapterSid,
        editorRef,
        collectMatchesInCurrentEditor: navigation.collectMatchesInCurrentEditor,
        pick: navigation.pick,
        currentMatchesControls: {
            setCurrentMatches: navigation.setCurrentMatches,
            setCurrentMatchIndex: navigation.setCurrentMatchIndex,
            setPickedResult: navigation.setPickedResult,
            pickedResult: navigation.pickedResult,
            currentMatchIndex: navigation.currentMatchIndex,
        },
    });

    const replace = useSearchReplace({
        history,
        editorRef,
        searchReference: execution.searchReference,
        pickedResult: navigation.pickedResult,
        currentMatches: navigation.currentMatches,
        currentMatchIndex: navigation.currentMatchIndex,
        setCurrentMatchIndex: navigation.setCurrentMatchIndex,
        setPickedResult: navigation.setPickedResult,
        setCurrentMatches: navigation.setCurrentMatches,
        searchTerm: execution.searchTerm,
        runSearchLogic: execution.runSearchLogic,
        matchCase: execution.matchCase,
        matchWholeWord: execution.matchWholeWord,
        pickedFile,
        pickedChapter,
        setTargetResults: execution.setTargetResults,
        setReferenceResults: execution.setReferenceResults,
    });

    const pickedResultIdx = navigation.getPickedResultIdx(execution.results);

    useEffect(() => {
        return history.registerPostUndoRedoAction(() => {
            if (!execution.isSearchPaneOpen) return;
            if (!execution.searchTerm.trim()) return;
            void execution.runSearchLogic(execution.searchTerm, {
                autoPick: false,
            });
        });
    }, [
        execution.isSearchPaneOpen,
        execution.runSearchLogic,
        execution.searchTerm,
        history,
    ]);

    useEffect(() => {
        if (execution.hasReferenceSearchAvailable || !execution.searchReference)
            return;
        execution.setSearchReferenceState(false);
        if (!execution.searchTerm.trim()) return;
        void execution.runSearchLogic(execution.searchTerm, {
            autoPick: false,
            scope: "project",
            overrides: { searchReference: false },
        });
    }, [
        execution.hasReferenceSearchAvailable,
        execution.runSearchLogic,
        execution.searchReference,
        execution.searchTerm,
        execution.setSearchReferenceState,
    ]);

    return {
        searchTerm: execution.searchTerm,
        onSearchChange: execution.onSearchChange,
        submitSearchNow: execution.submitSearchNow,
        isSearching: execution.isSearching,
        replaceTerm: replace.replaceTerm,
        setReplaceTerm: replace.setReplaceTerm,
        targetResults: execution.targetResults,
        referenceResults: execution.referenceResults,
        results: execution.results,
        pickedResult: navigation.pickedResult,
        pickedResultIdx,
        pickSearchResult: (r: SearchResult) =>
            navigation.pick(r, {
                activeSearchTerm: execution.searchTerm,
                searchReference: execution.searchReference,
                matchCase: execution.matchCase,
                matchWholeWord: execution.matchWholeWord,
            }),
        nextMatch: () =>
            navigation.nextMatch(execution.results, {
                activeSearchTerm: execution.searchTerm,
                searchReference: execution.searchReference,
                matchCase: execution.matchCase,
                matchWholeWord: execution.matchWholeWord,
            }),
        prevMatch: () =>
            navigation.prevMatch(execution.results, {
                activeSearchTerm: execution.searchTerm,
                searchReference: execution.searchReference,
                matchCase: execution.matchCase,
                matchWholeWord: execution.matchWholeWord,
            }),
        replaceCurrentMatch: replace.replaceCurrentMatch,
        replaceAllInChapter: replace.replaceAllInChapter,
        replaceMatch: replace.replaceMatch,
        rerunForCurrentChapter: execution.rerunForCurrentChapter,
        currentMatches: navigation.currentMatches,
        currentMatchIndex: navigation.currentMatchIndex,
        totalMatches: navigation.currentMatches.length,
        numCaseMismatches: execution.results.filter((r) => r.isCaseMismatch)
            .length,
        hasNext: execution.results.length > 0,
        hasPrev: execution.results.length > 0,
        isSearchPaneOpen: execution.isSearchPaneOpen,
        setIsSearchPaneOpen: execution.setSearchPaneOpen,
        matchWholeWord: execution.matchWholeWord,
        setMatchWholeWord: execution.setMatchWholeWord,
        matchCase: execution.matchCase,
        setMatchCase: execution.setMatchCase,
        searchUSFM: execution.searchUSFM,
        setSearchUSFM: execution.setSearchUSFM,
        hasReferenceSearchAvailable: execution.hasReferenceSearchAvailable,
        searchReference: execution.searchReference,
        setSearchReference: execution.setSearchReference,
        sortBy: execution.sortBy,
        currentSort: execution.currentSort,
        escapeRegex,
    };
}
