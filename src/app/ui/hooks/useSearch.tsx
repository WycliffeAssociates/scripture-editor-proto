import type { LexicalEditor } from "lexical";
import { type RefObject, useEffect, useMemo } from "react";
import type {
    SearchContentProvider,
    SearchResult,
} from "@/app/domain/search/SearchService.ts";
import { escapeRegex } from "@/app/domain/search/search.utils.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { useSearchExecution } from "@/app/ui/hooks/search/useSearchExecution.ts";
import { useSearchNavigation } from "@/app/ui/hooks/search/useSearchNavigation.ts";
import { useSearchReplace } from "@/app/ui/hooks/search/useSearchReplace.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { makeSid } from "@/core/data/bible/bible.ts";

type Props = {
    workingFiles: ScriptureBookState[];
    referenceFiles?: ScriptureBookState[];
    saveCurrentDirtyLexical: () => ScriptureBookState[] | undefined;
    contentProvider?: SearchContentProvider;
    switchBookOrChapter: (
        file: string,
        chapter: number,
    ) => ScriptureChapterState | undefined;
    editorRef: RefObject<LexicalEditor | null>;
    referenceEditorRef: RefObject<LexicalEditor | null>;
    pickedFile: ScriptureBookState;
    pickedChapter?: ScriptureChapterState;
    history: CustomHistoryHook;
};

export type UseSearchReturn = ReturnType<typeof useProjectSearch> & {
    searchUSFM: boolean;
    setSearchUSFM: (value: boolean) => void;
    hasReferenceSearchAvailable: boolean;
    searchReference: boolean;
    setSearchReference: (value: boolean) => void;
    setSearchReferenceImmediate: (value: boolean) => void;
    runSearchLogic: ReturnType<typeof useSearchExecution>["runSearchLogic"];
};

/**
 * Composes workspace search behavior across execution, navigation, highlighting,
 * and replace.
 *
 * The underlying search modules stay narrowly focused; this hook wires them to the
 * currently loaded scripture noun, visible editor refs, and optional reference
 * search source so the route-level editor shell can consume one cohesive search API.
 */
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
        chapter: pickedChapter?.chapterNumber || 1,
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
        preparePickedResult: navigation.preparePickedResult,
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
    }, [history, execution]);

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
        replaceSearchResult: replace.replaceSearchResult,
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
        setSearchReferenceImmediate: execution.setSearchReferenceState,
        sortBy: execution.sortBy,
        currentSort: execution.currentSort,
        escapeRegex,
        runSearchLogic: execution.runSearchLogic,
    };
}
