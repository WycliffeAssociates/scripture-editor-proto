import { Effect, Fiber } from "effect";
import type { LexicalEditor } from "lexical";
import { type RefObject, useEffect, useMemo, useRef } from "react";

import { makeSearchRerunPipeline } from "@/app/domain/editor/pipelines/searchRerunPipeline.ts";
import { escapeRegex } from "@/app/domain/search/search.utils.ts";
import type {
  SearchContentProvider,
  SearchResult,
} from "@/app/domain/search/SearchService.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { SearchHighlightStore } from "@/app/state/SearchHighlightStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { useSearchExecution } from "@/app/ui/hooks/search/useSearchExecution.ts";
import { useSearchNavigation } from "@/app/ui/hooks/search/useSearchNavigation.ts";
import { useSearchReplace } from "@/app/ui/hooks/search/useSearchReplace.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { makeSid } from "@/core/data/bible/bible.ts";

type Props = {
  workingFilesStore: WorkingFilesStore;
  searchHighlightStore: SearchHighlightStore;
  referenceFiles?: ScriptureBookState[];
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
  workingFilesStore,
  searchHighlightStore,
  referenceFiles,
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
        // Push-based read: the bridge plugin keeps the store fresh on
        // every editor commit, so a one-shot read returns the same shape
        // the legacy saveCurrentDirtyLexical() flush-then-read path used
        // to produce.
        getTargetFiles: () => workingFilesStore.read(),
        getReferenceFiles: () => referenceFiles ?? [],
      },
    [contentProvider, referenceFiles, workingFilesStore],
  );

  const currentChapterSid = makeSid({
    bookId: pickedFile.bookCode,
    chapter: pickedChapter?.chapterNumber || 1,
  });

  const navigation = useSearchNavigation({
    editorRef,
    referenceEditorRef,
    switchBookOrChapter,
    searchHighlightStore,
  });

  const execution = useSearchExecution({
    resolvedContentProvider,
    pickedFile,
    pickedChapter,
    currentChapterSid,
    editorRef,
    searchHighlightStore,
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
    searchHighlightStore,
    searchReference: execution.searchReference,
    pickedResult: navigation.pickedResult,
    currentMatches: navigation.currentMatches,
    currentMatchIndex: navigation.currentMatchIndex,
    setCurrentMatchIndex: navigation.setCurrentMatchIndex,
    setPickedResult: navigation.setPickedResult,
    searchTerm: execution.searchTerm,
    runSearchLogic: execution.runSearchLogic,
    matchCase: execution.matchCase,
    matchWholeWord: execution.matchWholeWord,
    pickedFile,
    pickedChapter,
    preparePickedResult: navigation.preparePickedResult,
  });

  // Auto-rerun on programmatic working-files changes (undo/redo,
  // programmaticFix, import). Pipeline + policy live in
  // `makeSearchRerunPipeline`; this hook just wires it. The
  // `executionRef` lets the pipeline read the latest search term and
  // rerun callback through getters without re-forking per render.
  const executionRef = useRef(execution);
  executionRef.current = execution;
  useEffect(() => {
    const fiber = Effect.runFork(
      makeSearchRerunPipeline({
        workingFilesStore,
        getSearchTerm: () => executionRef.current.searchTerm,
        rerunSearch: (term) => {
          void executionRef.current.runSearchLogic(term, {
            autoPick: false,
          });
        },
        // While the find panel is open, the docked editor lets edits happen
        // beside live results — keep them fresh by also rerunning on userEdit.
        isSearchActive: () => executionRef.current.isSearchPaneOpen,
      }),
    );
    return () => {
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [workingFilesStore]);

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
    pickSearchResult: (r: SearchResult) =>
      navigation.pick(r, {
        activeSearchTerm: execution.searchTerm,
        searchReference: execution.searchReference,
        matchCase: execution.matchCase,
        matchWholeWord: execution.matchWholeWord,
      }),
    replaceCurrentMatch: replace.replaceCurrentMatch,
    replaceSearchResult: replace.replaceSearchResult,
    replaceMatch: replace.replaceMatch,
    currentMatches: navigation.currentMatches,
    isSearchPaneOpen: execution.isSearchPaneOpen,
    setIsSearchPaneOpen: execution.setSearchPaneOpen,
    clearSearch: execution.clearSearch,
    isSearchDocked: execution.isSearchDocked,
    dockSearchPane: execution.dockSearchPane,
    toggleSearchDock: execution.toggleSearchDock,
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
