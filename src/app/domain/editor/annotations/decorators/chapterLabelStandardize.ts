// chapterLabelStandardize.ts
//
// The project-wide chapter-label standardize feature as plain domain
// functions, co-located with its decorator. One feature, one directory, two
// doorways: the `inconsistent-chapter-label` decorator's action opens the
// picker from a finding, and any future command surface calls
// `standardizeChapterLabels` directly — no finding, no decoration in the
// call path.

import { t } from "@lingui/core/macro";

import { type EditorModeSetting, shapeForSurface } from "@/app/data/editor.ts";
import {
  applyChapterLabelRewrites,
  fabricateChapterLabelRewrites,
} from "@/app/domain/editor/annotations/chapterLabelRewrite.ts";
import {
  type ChapterLabelTally,
  findChapterLabelEntries,
  tallyChapterLabels,
} from "@/app/domain/editor/annotations/chapterLabelTally.ts";
import { rebuildParsedFileFromUsfm } from "@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts";
import {
  bookLineEnding,
  tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { withWorkingFilesDraft } from "@/app/domain/project/workingFileCommand.ts";
import type {
  ReadonlyScriptureBookState,
  ScriptureBookState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
import { showNotificationSuccess } from "@/app/ui/components/primitives/notifications.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

/**
 * Tally every `\cl` label across the committed working files — the picker's
 * input. Derived on demand (a click, not a hover), so the hover path stays
 * cheap.
 */
export function computeChapterLabelTally(
  files: ScriptureBookState[],
): ChapterLabelTally {
  const tokens = files.flatMap((book) =>
    book.chapters.flatMap((chapter) => chapter.currentTokens),
  );
  return tallyChapterLabels(findChapterLabelEntries(tokens));
}

/**
 * Compute the rebuilt USFM for one book's off-target `\cl` labels — pure
 * compute (per the `withWorkingFilesDraft` contract, no store writes here).
 * Rewrites the labels by direct token mutation → `tokensToUsfm`, exactly like
 * `applyLintFixToFile` but with an app-fabricated rewrite instead of an onion
 * `TokenFix`. Returns the new book text, or null when this book is on target.
 */
function computeChapterLabelUsfm(
  file: ReadonlyScriptureBookState,
  targetStem: string,
): string | null {
  const tokens = file.chapters.flatMap((chapter) => chapter.currentTokens);
  const rewrites = fabricateChapterLabelRewrites(tokens, targetStem);
  if (rewrites.length === 0) return null;

  const nextTokens = applyChapterLabelRewrites(tokens, rewrites);
  // `lexicalToTokens` stamps LF newlines, so the file's own EOL is the source
  // of truth here (mirrors applyLintFixToFile — keeps the CRLF/LF fix intact).
  return tokensToUsfm(nextTokens, bookLineEnding(file));
}

export type StandardizeChapterLabelsDeps = {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  history: CustomHistoryHook;
  usfmOnionService: IUsfmOnionService;
  editorMode: EditorModeSetting;
};

/**
 * Project-wide chapter-label standardize.
 *
 * The multi-book sibling of `fixLintFinding`: it spans every book that carries
 * an off-target `\cl` label, so it commits at WORKSPACE scope (a validated bulk
 * over N books) rather than the single-book per-chapter overlay. Per the
 * `withWorkingFilesDraft` contract, the mutator only writes the scratch and
 * computes which books changed; lint/diff/editor sync are commit-stream
 * subscribers reacting to the published scope, and the success toast runs on
 * the typed result.
 */
export async function standardizeChapterLabels(
  targetStem: string,
  deps: StandardizeChapterLabelsDeps,
) {
  // Crash-recovery gate — a gated call is a no-op (withWorkingFilesDraft
  // also rechecks at commit time).
  if (!requireGateOpen(deps.interactionGate.get())) return;

  // Cheap pre-check: bail before capturing history if no book carries an
  // off-target label. The seam measures the actually-changed books from its
  // own checkouts.
  const hasCandidate = deps.workingFilesStore
    .read()
    .some((file) => computeChapterLabelUsfm(file, targetStem) !== null);
  if (!hasCandidate) return;

  const historyToken = deps.history.captureHistory();
  const outcome = await withWorkingFilesDraft<{
    changedBookCodes: string[];
  }>({
    workingFilesStore: deps.workingFilesStore,
    interactionGate: deps.interactionGate,
    commitMeta: {
      kind: "programmaticFix",
      action: "chapterLabelStandardize",
      dirtyTextContent: true,
    },
    mutate: async (draft) => {
      const changedBookCodes: string[] = [];
      for (const file of draft.read()) {
        const nextUsfm = computeChapterLabelUsfm(file, targetStem);
        if (nextUsfm === null) continue;
        // Off-target labels found — check the book out and rebuild it
        // wholesale from the rewritten USFM.
        const writableFile = draft.bookForWrite(file.bookCode);
        if (!writableFile) continue;
        await rebuildParsedFileFromUsfm({
          targetFile: writableFile,
          sourceUsfm: nextUsfm,
          usfmOnionService: deps.usfmOnionService,
          shape: shapeForSurface("workingRebuild", deps.editorMode),
        });
        changedBookCodes.push(file.bookCode);
      }
      return { changedBookCodes };
    },
  });

  if (outcome.kind !== "committed") return;
  deps.history.recordHistory(historyToken, {
    label: t`Standardize chapter labels to "${targetStem}"`,
    affected: outcome.committedChapters,
  });
  showNotificationSuccess({
    notification: {
      title: t`Chapter labels standardized`,
      message: t`Set chapter labels to "${targetStem}" across ${outcome.value.changedBookCodes.length} book(s)`,
    },
  });
}
