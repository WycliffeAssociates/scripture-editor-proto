import type { LexicalEditor } from "lexical";
import { type RefObject, useCallback, useMemo, useState } from "react";

import {
  probeReplaceGap,
  type ReplaceOnStoreDeps,
  replaceMatchOnStore,
  type ReplaceTarget,
} from "@/app/domain/search/replaceOnStore.ts";
import type { SearchResult } from "@/app/domain/search/SearchService.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import type {
  SearchMatch,
  SearchRunResult,
} from "@/app/ui/hooks/search/searchTypes.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { scrollToSidInEditor } from "@/app/ui/hooks/useSearchHighlighter.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

type PickArgs = {
  activeSearchTerm: string;
  searchReference: boolean;
  matchCase: boolean;
  matchWholeWord: boolean;
  searchUSFM: boolean;
};

type Params = {
  history: CustomHistoryHook;
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  usfmOnionService: IUsfmOnionService;
  editorRef: RefObject<LexicalEditor | null>;
  searchReference: boolean;
  searchUSFM: boolean;
  setSearchUSFM: (value: boolean) => void;
  pickedResult: SearchResult | null;
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
  preparePickedResult: (
    result: SearchResult,
    args: PickArgs,
  ) => Promise<{
    matches: SearchMatch[];
    activeMatch?: SearchMatch;
  } | null>;
};

/**
 * Hook that owns inline replace operations for the current scripture editor.
 *
 * Replace mutates the canonical token store (never the live Lexical node tree)
 * and commits through the working-files seam as a `programmaticFix`; the
 * visible editor re-renders via `makeEditorSyncPipeline`. A gap match (see
 * `matchHasGap`) is find-only: its affordance toggles to USFM mode and
 * navigates to the verse instead of replacing.
 */
export function useSearchReplace({
  history,
  workingFilesStore,
  interactionGate,
  usfmOnionService,
  editorRef,
  searchReference,
  searchUSFM,
  setSearchUSFM,
  pickedResult,
  setPickedResult,
  searchTerm,
  runSearchLogic,
  matchCase,
  matchWholeWord,
  preparePickedResult,
}: Params) {
  const [replaceTerm, setReplaceTerm] = useState<string>("");

  const deps: ReplaceOnStoreDeps = useMemo(
    () => ({ workingFilesStore, interactionGate, history, usfmOnionService }),
    [workingFilesStore, interactionGate, history, usfmOnionService],
  );

  const pickArgs = useCallback(
    (activeSearchTerm: string): PickArgs => ({
      activeSearchTerm,
      searchReference,
      matchCase,
      matchWholeWord,
      searchUSFM,
    }),
    [matchCase, matchWholeWord, searchReference, searchUSFM],
  );

  /**
   * Toggle to USFM mode and land on the verse. Used for gap matches whose
   * replace is refused in regular mode. In the typical case the original term
   * no longer matches the USFM projection (the hidden bytes are now in it), so
   * there is no active match to scroll to — fall back to scrolling the verse
   * itself into view by sid, via the `data-sid` the editor renders.
   */
  const editMatchInUsfmMode = useCallback(
    (result: SearchResult) => {
      setSearchUSFM(true);
      void preparePickedResult(result, {
        ...pickArgs(searchTerm),
        searchUSFM: true,
      }).then((prepared) => {
        if (prepared?.activeMatch) return;
        const editor = editorRef.current;
        if (editor) scrollToSidInEditor(editor, result.sid);
      });
    },
    [editorRef, pickArgs, preparePickedResult, searchTerm, setSearchUSFM],
  );

  const isReplaceGap = useCallback(
    (result: SearchResult): boolean => {
      if (result.source === "reference") return false;
      return probeReplaceGap({
        workingFilesStore,
        target: {
          bookCode: result.bibleIdentifier,
          chapterNum: result.chapNum,
          sid: result.sid,
          sidOccurrenceIndex: result.sidOccurrenceIndex,
        },
        searchTerm,
        matchCase,
        matchWholeWord,
        searchUSFM,
      });
    },
    [matchCase, matchWholeWord, searchTerm, searchUSFM, workingFilesStore],
  );

  // After a committed replace, refresh the current chapter's results and
  // re-pick the same verse so the active highlight + scroll follow the edit.
  const refreshAndRepick = useCallback(
    async (result: SearchResult) => {
      const rerun = await runSearchLogic(searchTerm, {
        autoPick: false,
        scope: "currentChapter",
      });
      if (!rerun) return;
      const refreshed = rerun.sortedResults.find(
        (candidate) =>
          candidate.source === "target" &&
          candidate.sid === result.sid &&
          candidate.sidOccurrenceIndex === result.sidOccurrenceIndex &&
          candidate.bibleIdentifier === result.bibleIdentifier &&
          candidate.chapNum === result.chapNum,
      );
      if (!refreshed) {
        setPickedResult(null);
        return;
      }
      await preparePickedResult(refreshed, pickArgs(searchTerm));
    },
    [
      pickArgs,
      preparePickedResult,
      runSearchLogic,
      searchTerm,
      setPickedResult,
    ],
  );

  const replaceTargetResult = useCallback(
    async (result: SearchResult, replacement: string) => {
      if (searchReference || result.source === "reference") return;
      // The replacement passes through VERBATIM — leading/trailing/interior
      // whitespace is meaningful bytes. Only a fully empty replacement
      // (deletion) is refused.
      if (replacement.length === 0 || !searchTerm.trim()) return;

      const target: ReplaceTarget = {
        bookCode: result.bibleIdentifier,
        chapterNum: result.chapNum,
        sid: result.sid,
        sidOccurrenceIndex: result.sidOccurrenceIndex,
      };
      const outcome = await replaceMatchOnStore({
        target,
        replacement,
        searchTerm,
        matchCase,
        matchWholeWord,
        searchUSFM,
        deps,
      });

      if (outcome.kind === "gap") {
        editMatchInUsfmMode(result);
        return;
      }
      if (outcome.kind === "committed") await refreshAndRepick(result);
    },
    [
      deps,
      editMatchInUsfmMode,
      matchCase,
      matchWholeWord,
      refreshAndRepick,
      searchReference,
      searchTerm,
      searchUSFM,
    ],
  );

  const replaceCurrentMatch = useCallback(
    async (replacementOverride?: string) => {
      if (!pickedResult) return;
      const replacement = replacementOverride ?? replaceTerm;
      await replaceTargetResult(pickedResult, replacement);
    },
    [pickedResult, replaceTargetResult, replaceTerm],
  );

  const replaceSearchResult = useCallback(
    (result: SearchResult, replacement: string) =>
      replaceTargetResult(result, replacement),
    [replaceTargetResult],
  );

  // The inline in-editor affordance replaces one specific match. A gap match
  // routes to the USFM-mode toggle instead of a silent no-op.
  const replaceMatch = useCallback(
    async (match: SearchMatch) => {
      if (match.source === "reference") return;
      const asResult: SearchResult = {
        sid: match.sid,
        sidOccurrenceIndex: match.sidOccurrenceIndex,
        bibleIdentifier: match.bookCode,
        chapNum: match.chapterNum,
        source: "target",
        text: "",
        parsedSid: null,
        isCaseMismatch: false,
        naturalIndex: 0,
        occurrenceCount: 1,
      };
      if (match.hasGap && !searchUSFM) {
        editMatchInUsfmMode(asResult);
        return;
      }
      await replaceTargetResult(asResult, replaceTerm);
    },
    [editMatchInUsfmMode, replaceTargetResult, replaceTerm, searchUSFM],
  );

  return {
    replaceTerm,
    setReplaceTerm,
    replaceMatch,
    replaceCurrentMatch,
    replaceSearchResult,
    isReplaceGap,
    editMatchInUsfmMode,
  };
}
