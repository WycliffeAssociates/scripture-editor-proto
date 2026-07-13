// replaceOnStore.ts
//
// The store-committing verb for find/replace — the sibling of lintFix.ts and
// chapterLabelStandardize.ts. It resolves a match against the canonical token
// store, applies the right tier (tokenReplace.ts), and commits the new
// `currentTokens` through the working-files seam as one history transaction.
//
// The editor is a view: a `programmaticFix` commit that touches the visible
// chapter re-renders through `makeEditorSyncPipeline` (the same seam lint
// autofix rides). A replace in a chapter that isn't on screen is a pure store
// mutation. There is no second editor-push path.

import { t } from "@lingui/core/macro";

import { withWorkingFilesDraft } from "@/app/domain/project/workingFileCommand.ts";
import {
  projectChapterTokens,
  type SidProjection,
} from "@/app/domain/search/searchProjection.ts";
import {
  applyTier1,
  applyTier2,
  classifyTier,
  matchHasGap,
  type MatchAnchors,
  resolveMatchAnchors,
} from "@/app/domain/search/tokenReplace.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { findAllMatches } from "@/core/domain/search/searchEngine.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

export type ReplaceOnStoreDeps = {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  history: CustomHistoryHook;
  usfmOnionService: IUsfmOnionService;
};

/** Which occurrence of the term, in which verse of which chapter, to replace. */
export type ReplaceTarget = {
  bookCode: string;
  chapterNum: number;
  sid: string;
  sidOccurrenceIndex: number;
};

export type ReplaceOnStoreResult =
  | { kind: "committed" }
  | { kind: "unchanged" }
  /** Regular-mode span crosses hidden markup (see `matchHasGap`); nothing committed. */
  | { kind: "gap" };

type ResolvedMatch = {
  anchors: MatchAnchors;
  hasGap: boolean;
};

/**
 * Locate the target occurrence in a chapter's tokens and resolve it to token
 * anchors + a gap verdict. Pure over `(tokens, mode, query)`; used both for the
 * pre-commit gap decision and again inside the draft against the latest tokens.
 */
function resolveTargetInChapter(args: {
  tokens: readonly Token[];
  target: ReplaceTarget;
  searchTerm: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  searchUSFM: boolean;
}): { sidProjection: SidProjection; resolved: ResolvedMatch } | null {
  const projection = projectChapterTokens({
    tokens: args.tokens,
    includeUSFM: args.searchUSFM,
  });
  const sidProjection = projection.get(args.target.sid);
  if (!sidProjection) return null;

  const matches = findAllMatches({
    textToSearch: sidProjection.text,
    searchTerm: args.searchTerm,
    matchCase: args.matchCase,
    matchWholeWord: args.matchWholeWord,
  });
  const match = matches[args.target.sidOccurrenceIndex];
  if (!match) return null;

  const anchors = resolveMatchAnchors(sidProjection, match.start, match.end);
  if (!anchors) return null;

  const coveredIndices = new Set(
    sidProjection.segments.map((segment) => segment.tokenIndex),
  );
  const hasGap = matchHasGap({ tokens: args.tokens, anchors, coveredIndices });
  return { sidProjection, resolved: { anchors, hasGap } };
}

/**
 * Would replacing this target be refused as a hidden-markup gap? Pure store
 * read — the result row uses it to show the "edit in USFM mode" affordance
 * instead of a replace input. Always false in USFM mode (nothing is hidden).
 */
export function probeReplaceGap(args: {
  workingFilesStore: WorkingFilesStore;
  target: ReplaceTarget;
  searchTerm: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  searchUSFM: boolean;
}): boolean {
  if (args.searchUSFM) return false;
  const chapter = args.workingFilesStore
    .read()
    .find((b) => b.bookCode === args.target.bookCode)
    ?.chapters.find((c) => c.chapterNumber === args.target.chapterNum);
  if (!chapter) return false;
  const resolved = resolveTargetInChapter({
    tokens: chapter.currentTokens,
    target: args.target,
    searchTerm: args.searchTerm,
    matchCase: args.matchCase,
    matchWholeWord: args.matchWholeWord,
    searchUSFM: args.searchUSFM,
  });
  return resolved?.resolved.hasGap ?? false;
}

// Byte equality of the joined sources. Deliberately NOT gated on token count:
// the same bytes can carry different token boundaries (e.g. a windowed re-lex
// merging adjacent text runs), and dirty tracks CONTENT, not tokenization.
function sourcesEqual(a: readonly Token[], b: readonly Token[]): boolean {
  let aJoined = "";
  let bJoined = "";
  for (const token of a) aJoined += token.source;
  for (const token of b) bJoined += token.source;
  return aJoined === bJoined;
}

/**
 * Replace one match against the token store. Returns `gap` (without touching
 * the store) when a regular-mode match crosses hidden markup, so the caller can
 * toggle to USFM mode instead.
 */
export async function replaceMatchOnStore(args: {
  target: ReplaceTarget;
  replacement: string;
  searchTerm: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  searchUSFM: boolean;
  deps: ReplaceOnStoreDeps;
}): Promise<ReplaceOnStoreResult> {
  const { target, replacement, deps } = args;
  if (!requireGateOpen(deps.interactionGate.get()))
    return { kind: "unchanged" };
  if (!replacement || !args.searchTerm.trim()) return { kind: "unchanged" };

  const book = deps.workingFilesStore
    .read()
    .find((b) => b.bookCode === target.bookCode);
  const chapter = book?.chapters.find(
    (c) => c.chapterNumber === target.chapterNum,
  );
  if (!chapter) return { kind: "unchanged" };

  // Pre-commit gap decision — a UI branch, made before capturing history or
  // entering the draft. In USFM mode markers are projected, so nothing is
  // hidden and this never fires.
  const preResolved = resolveTargetInChapter({
    tokens: chapter.currentTokens,
    target,
    searchTerm: args.searchTerm,
    matchCase: args.matchCase,
    matchWholeWord: args.matchWholeWord,
    searchUSFM: args.searchUSFM,
  });
  if (!preResolved) return { kind: "unchanged" };
  if (preResolved.resolved.hasGap && !args.searchUSFM) return { kind: "gap" };

  const relexWindow = async (windowSource: string): Promise<Token[]> =>
    (await deps.usfmOnionService.parseUsfm(windowSource)).tokens;

  const historyToken = deps.history.captureHistory();
  const outcome = await withWorkingFilesDraft({
    workingFilesStore: deps.workingFilesStore,
    interactionGate: deps.interactionGate,
    commitMeta: {
      kind: "programmaticFix",
      action: "searchReplace",
      dirtyTextContent: true,
    },
    // Re-resolve against the LATEST draft tokens: the chapter may have changed
    // between the pre-check and here. No match now ⇒ no checkout ⇒ unchanged.
    mutate: async (draft) => {
      const draftBook = draft
        .read()
        .find((b) => b.bookCode === target.bookCode);
      const draftChapter = draftBook?.chapters.find(
        (c) => c.chapterNumber === target.chapterNum,
      );
      if (!draftChapter) return;

      const resolved = resolveTargetInChapter({
        tokens: draftChapter.currentTokens,
        target,
        searchTerm: args.searchTerm,
        matchCase: args.matchCase,
        matchWholeWord: args.matchWholeWord,
        searchUSFM: args.searchUSFM,
      });
      if (!resolved) return;
      // Hidden-markup gaps never commit — mirrors the pre-commit refusal in
      // case the tokens shifted under us into a gap span.
      if (resolved.resolved.hasGap && !args.searchUSFM) return;

      const { anchors } = resolved.resolved;
      const tier = classifyTier({
        tokens: draftChapter.currentTokens,
        anchors,
        replacement,
      });
      const nextTokens =
        tier === "tier1"
          ? applyTier1({
              tokens: draftChapter.currentTokens,
              anchors,
              replacement,
            })
          : await applyTier2({
              tokens: draftChapter.currentTokens,
              anchors,
              replacement,
              bookCode: target.bookCode,
              relexWindow,
            });

      const writable = draft.chapterForWrite({
        bookCode: target.bookCode,
        chapterNum: target.chapterNum,
      });
      if (!writable) return;
      writable.currentTokens = nextTokens;
      writable.dirty = !sourcesEqual(nextTokens, writable.sourceTokens);
    },
  });

  if (outcome.kind !== "committed") return { kind: "unchanged" };
  deps.history.recordHistory(historyToken, {
    label: t`Replace "${args.searchTerm}" with "${replacement}"`,
    affected: outcome.committedChapters,
  });
  return { kind: "committed" };
}
