import { $getRoot, type LexicalEditor } from "lexical";
import { type RefObject, useCallback, useMemo, useState } from "react";

import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { escapeRegex } from "@/app/domain/search/search.utils.ts";
import type {
  SearchResult,
  SearchSource,
} from "@/app/domain/search/SearchService.ts";
import type { ScriptureChapterState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { SearchHighlightStore } from "@/app/state/SearchHighlightStore.ts";
import type {
  SearchMatch,
  SearchRunOptionOverrides,
} from "@/app/ui/hooks/search/searchTypes.ts";
import {
  type MatchInNode,
  scrollToActiveMatchInEditor,
} from "@/app/ui/hooks/useSearchHighlighter.ts";

type Params = {
  editorRef: RefObject<LexicalEditor | null>;
  referenceEditorRef: RefObject<LexicalEditor | null>;
  searchHighlightStore: SearchHighlightStore;
  switchBookOrChapter: (
    file: string,
    chapter: number,
  ) => ScriptureChapterState | undefined;
};

/**
 * Hook that turns search results into editor navigation and highlight state.
 *
 * Search execution can find matches across multiple chapters and even the
 * reference pane. This hook is responsible for opening the right chapter,
 * collecting the rendered node matches, and synchronizing the active highlight.
 */
export function useSearchNavigation({
  editorRef,
  referenceEditorRef,
  searchHighlightStore,
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
      const effectiveMatchCase = options.matchCase ?? options.baseMatchCase;
      const effectiveMatchWholeWord =
        options.matchWholeWord ?? options.baseMatchWholeWord;

      const searchMatches: SearchMatch[] = [];
      const sidOccurrenceMap = new Map<string, number>();
      editor.read(() => {
        const root = $getRoot();
        root.getAllTextNodes().forEach((node) => {
          const text = node.getTextContent();
          const sid = $isUSFMTextNode(node) ? node.getSid() : undefined;

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
                sidOccurrenceMap.set(sid, (sidOccurrenceIndex ?? 0) + 1);
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
            const textToSearch = effectiveMatchCase ? text : text.toLowerCase();
            const termToSearch = effectiveMatchCase
              ? activeSearchTerm
              : activeSearchTerm.toLowerCase();

            let index = textToSearch.indexOf(termToSearch);
            while (index !== -1) {
              const sidOccurrenceIndex = sid
                ? (sidOccurrenceMap.get(sid) ?? 0)
                : undefined;
              if (sid) {
                sidOccurrenceMap.set(sid, (sidOccurrenceIndex ?? 0) + 1);
              }
              searchMatches.push({
                node,
                start: index,
                end: index + activeSearchTerm.length,
                source,
                sid,
                sidOccurrenceIndex,
              });
              index = textToSearch.indexOf(termToSearch, index + 1);
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

  const preparePickedResult = useCallback(
    (
      result: SearchResult,
      args: {
        activeSearchTerm: string;
        searchReference: boolean;
        matchCase: boolean;
        matchWholeWord: boolean;
      },
    ) =>
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

        queueMicrotask(() => {
          const targetEditor = editorRef.current;
          if (!targetEditor) {
            resolve(null);
            return;
          }

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

            resolve({
              matches: nextMatches,
              activeMatch,
            });
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
              setCurrentMatchIndex(searchMatches.indexOf(matchForResult));
            }
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
          resolve({
            matches: searchMatches,
            activeMatch,
          });
        });
      }),
    [
      collectMatchesInCurrentEditor,
      collectMatchesInEditor,
      editorRef,
      referenceEditorRef,
      searchHighlightStore,
      switchBookOrChapter,
    ],
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
      void preparePickedResult(result, args);
    },
    [preparePickedResult],
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

  // Occurrences of the picked verse within the loaded editor, in document order.
  // `currentMatches` holds every match in the visible editor(s); a verse can carry
  // several when the term repeats inside it. Cycling steps the active match across
  // these without leaving the verse — inter-verse movement stays nextMatch/prevMatch.
  const pickedOccurrences = useMemo(() => {
    if (!pickedResult) return [];
    return currentMatches.filter(
      (m) => m.source === pickedResult.source && m.sid === pickedResult.sid,
    );
  }, [currentMatches, pickedResult]);

  // The active occurrence's place within its verse — drives the result row's
  // stepper (shown only when count > 1). Null when nothing is picked.
  const activeMatchOccurrence = useMemo(() => {
    if (pickedOccurrences.length === 0) return null;
    const active = currentMatches[currentMatchIndex];
    const position = active ? pickedOccurrences.indexOf(active) : -1;
    return {
      count: pickedOccurrences.length,
      position: position === -1 ? 0 : position,
    };
  }, [pickedOccurrences, currentMatches, currentMatchIndex]);

  const repaintActiveMatch = useCallback(
    (nextActive: SearchMatch) => {
      const targetEditor = editorRef.current;
      const referenceEditor = referenceEditorRef.current;
      const targetMatches = currentMatches.filter((m) => m.source === "target");
      const referenceMatches = currentMatches.filter(
        (m) => m.source === "reference",
      );
      searchHighlightStore.set([
        ...(targetEditor
          ? [
              {
                editor: targetEditor,
                matches: targetMatches,
                activeMatch:
                  nextActive.source === "target" ? nextActive : undefined,
              },
            ]
          : []),
        ...(referenceEditor
          ? [
              {
                editor: referenceEditor,
                matches: referenceMatches,
                activeMatch:
                  nextActive.source === "reference" ? nextActive : undefined,
              },
            ]
          : []),
      ]);
      const editor =
        nextActive.source === "reference" ? referenceEditor : targetEditor;
      if (editor) scrollToActiveMatchInEditor(editor, nextActive);
    },
    [currentMatches, editorRef, referenceEditorRef, searchHighlightStore],
  );

  // Move the active highlight to the next/prev occurrence WITHIN the picked verse.
  // Clamped at the ends (no wrap): the verse boundary is deliberate, so reaching the
  // last occurrence doesn't silently jump into another verse's matches.
  const stepActiveMatch = useCallback(
    (direction: "next" | "prev") => {
      if (pickedOccurrences.length <= 1) return;
      const active = currentMatches[currentMatchIndex];
      const pos = active ? pickedOccurrences.indexOf(active) : 0;
      const nextPos = direction === "next" ? pos + 1 : pos - 1;
      if (nextPos < 0 || nextPos >= pickedOccurrences.length) return;
      const nextActive = pickedOccurrences[nextPos];
      setCurrentMatchIndex(currentMatches.indexOf(nextActive));
      repaintActiveMatch(nextActive);
    },
    [pickedOccurrences, currentMatches, currentMatchIndex, repaintActiveMatch],
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
    nextMatch,
    prevMatch,
    stepActiveMatch,
    activeMatchOccurrence,
    getPickedResultIdx,
    findMatchIndex,
    preparePickedResult,
  };
}
