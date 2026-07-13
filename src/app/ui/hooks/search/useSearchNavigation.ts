import type { LexicalEditor } from "lexical";
import { type RefObject, useCallback, useState } from "react";

import { collectChapterMatches } from "@/app/domain/search/collectMatches.ts";
import type {
  SearchResult,
  SearchSource,
} from "@/app/domain/search/SearchService.ts";
import type { ScriptureChapterState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { SearchHighlightStore } from "@/app/state/SearchHighlightStore.ts";
import type {
  CollectMatchOptions,
  SearchMatch,
} from "@/app/ui/hooks/search/searchTypes.ts";
import { scrollToActiveMatchInEditor } from "@/app/ui/hooks/useSearchHighlighter.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/** How to reach a chapter's canonical tokens for a given search source. */
export type ResolveChapterTokens = (
  source: SearchSource,
  bookCode: string,
  chapterNum: number,
) => readonly Token[] | undefined;

type PickArgs = {
  activeSearchTerm: string;
  searchReference: boolean;
  matchCase: boolean;
  matchWholeWord: boolean;
  searchUSFM: boolean;
};

type Params = {
  editorRef: RefObject<LexicalEditor | null>;
  referenceEditorRef: RefObject<LexicalEditor | null>;
  searchHighlightStore: SearchHighlightStore;
  switchBookOrChapter: (
    file: string,
    chapter: number,
  ) => ScriptureChapterState | undefined;
  resolveChapterTokens: ResolveChapterTokens;
  getVisibleTarget: () => { bookCode: string; chapterNum: number };
};

/**
 * Hook that turns search results into editor navigation and highlight state.
 *
 * Matches are resolved against the canonical token store (not the live Lexical
 * node tree), so a USFM-mode marker match resolves like any other. This hook
 * opens the right chapter, collects that chapter's token-anchored matches, and
 * synchronizes the active highlight.
 */
export function useSearchNavigation({
  editorRef,
  referenceEditorRef,
  searchHighlightStore,
  switchBookOrChapter,
  resolveChapterTokens,
  getVisibleTarget,
}: Params) {
  const [currentMatches, setCurrentMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const [pickedResult, setPickedResult] = useState<SearchResult | null>(null);

  const collectMatches = useCallback(
    (args: {
      source: SearchSource;
      bookCode: string;
      chapterNum: number;
      searchTerm: string;
      matchCase: boolean;
      matchWholeWord: boolean;
      searchUSFM: boolean;
    }): SearchMatch[] => {
      const tokens = resolveChapterTokens(
        args.source,
        args.bookCode,
        args.chapterNum,
      );
      if (!tokens) return [];
      return collectChapterMatches({ ...args, tokens });
    },
    [resolveChapterTokens],
  );

  const collectMatchesInCurrentEditor = useCallback(
    (activeSearchTerm: string, options: CollectMatchOptions): SearchMatch[] => {
      const target = getVisibleTarget();
      return collectMatches({
        source: "target",
        bookCode: target.bookCode,
        chapterNum: target.chapterNum,
        searchTerm: activeSearchTerm,
        matchCase: options.matchCase ?? options.baseMatchCase,
        matchWholeWord: options.matchWholeWord ?? options.baseMatchWholeWord,
        searchUSFM: options.searchUSFM,
      });
    },
    [collectMatches, getVisibleTarget],
  );

  const preparePickedResult = useCallback(
    (result: SearchResult, args: PickArgs) =>
      new Promise<{
        matches: SearchMatch[];
        activeMatch?: SearchMatch;
      } | null>((resolve) => {
        searchHighlightStore.clear();
        setPickedResult(result);

        const newChapterState = switchBookOrChapter(
          result.bibleIdentifier,
          result.chapNum,
        );
        if (!newChapterState) {
          resolve(null);
          return;
        }

        const collectForResult = (source: SearchSource) =>
          collectMatches({
            source,
            bookCode: result.bibleIdentifier,
            chapterNum: result.chapNum,
            searchTerm: args.activeSearchTerm,
            matchCase: args.matchCase,
            matchWholeWord: args.matchWholeWord,
            searchUSFM: args.searchUSFM,
          });
        const findActive = (matches: SearchMatch[]) =>
          matches.find(
            (m) =>
              m.sid === result.sid &&
              m.sidOccurrenceIndex === result.sidOccurrenceIndex,
          );

        // Collection reads the store (DOM-independent), but painting/scroll
        // resolve `data-id` against the just-swapped editor DOM — defer a tick
        // so those elements exist.
        queueMicrotask(() => {
          const targetEditor = editorRef.current;
          if (!targetEditor) {
            resolve(null);
            return;
          }

          if (args.searchReference || result.source === "reference") {
            const targetMatches = collectForResult("target");
            const referenceEditor = referenceEditorRef.current;
            const referenceMatches = referenceEditor
              ? collectForResult("reference")
              : [];
            const nextMatches = [...targetMatches, ...referenceMatches];
            setCurrentMatches(nextMatches);

            const activeTargetMatch = findActive(targetMatches);
            const activeReferenceMatch = findActive(referenceMatches);
            const activeMatch =
              activeTargetMatch ?? activeReferenceMatch ?? undefined;
            setCurrentMatchIndex(
              activeMatch ? nextMatches.indexOf(activeMatch) : 0,
            );

            searchHighlightStore.set([
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
            if (activeTargetMatch) {
              scrollToActiveMatchInEditor(targetEditor, activeTargetMatch);
            } else if (activeReferenceMatch && referenceEditor) {
              scrollToActiveMatchInEditor(
                referenceEditor,
                activeReferenceMatch,
              );
            }

            resolve({ matches: nextMatches, activeMatch });
            return;
          }

          const searchMatches = collectForResult("target");
          setCurrentMatches(searchMatches);

          const activeMatch = findActive(searchMatches);
          if (activeMatch) {
            setCurrentMatchIndex(searchMatches.indexOf(activeMatch));
          }

          searchHighlightStore.set([
            {
              editor: targetEditor,
              matches: searchMatches,
              activeMatch,
            },
          ]);
          if (activeMatch) {
            scrollToActiveMatchInEditor(targetEditor, activeMatch);
          }
          resolve({ matches: searchMatches, activeMatch });
        });
      }),
    [
      collectMatches,
      editorRef,
      referenceEditorRef,
      searchHighlightStore,
      switchBookOrChapter,
    ],
  );

  const pick = useCallback(
    (result: SearchResult, args: PickArgs) => {
      void preparePickedResult(result, args);
    },
    [preparePickedResult],
  );

  return {
    currentMatches,
    setCurrentMatches,
    currentMatchIndex,
    setCurrentMatchIndex,
    pickedResult,
    setPickedResult,
    collectMatchesInCurrentEditor,
    pick,
    preparePickedResult,
  };
}
