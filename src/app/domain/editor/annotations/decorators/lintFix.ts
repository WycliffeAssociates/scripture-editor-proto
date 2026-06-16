// lintFix.ts
//
// The lint-fix feature as plain domain functions, co-located with the
// decorator that exposes it (`decorateFinding.tsx` builds the apply action
// from `issue.fix`). Nothing here is hook-shaped: callers hand in the
// capabilities (store, gate, history, onion service), so the same function is
// reachable from a finding's action today and from any future command surface
// without decoration in the call path.

import { t } from "@lingui/core/macro";

import { type EditorModeSetting, shapeForSurface } from "@/app/data/editor.ts";
import { onionFindingsByChapter } from "@/app/domain/editor/annotations/normalizeFindings.ts";
import { rebuildParsedFileFromUsfm } from "@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts";
import {
  bookLineEnding,
  tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { withWorkingFilesDraft } from "@/app/domain/project/workingFileCommand.ts";
import type { ReadonlyScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { FindingsStore } from "@/app/state/FindingsStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
import { showNotificationSuccess } from "@/app/ui/components/primitives/notifications.ts";
import { relintBookFile } from "@/app/ui/hooks/linting.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { formatTokenFixLabel } from "@/app/ui/i18n/usfmOnionLocalization.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { LintIssue, TokenFix } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * After a fix is applied and the book is relinted, issue ids/spans can shift.
 * Match the requested issue back to the relinted result set using progressively
 * looser heuristics so the UI can keep focus on the "same" logical problem.
 */
function sameSpan(
  left?: { start: number; end: number } | null,
  right?: { start: number; end: number } | null,
) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.start === right.start && left.end === right.end;
}

function findEquivalentIssue(
  issues: LintIssue[],
  target: LintIssue,
  targetBook: string,
  targetChapter: number,
): LintIssue | null {
  const candidates = issues.filter((candidate) => {
    const candidateSid = parseSid(candidate.sid ?? "");
    return (
      candidateSid?.book === targetBook &&
      candidateSid?.chapter === targetChapter &&
      candidate.code === target.code
    );
  });

  if (!candidates.length) return null;

  const exact = candidates.find(
    (candidate) =>
      candidate.sid === target.sid &&
      candidate.message === target.message &&
      sameSpan(candidate.span, target.span) &&
      sameSpan(candidate.relatedSpan, target.relatedSpan),
  );
  if (exact) return exact;

  const sameMessageAndSid = candidates.find(
    (candidate) =>
      candidate.sid === target.sid && candidate.message === target.message,
  );
  if (sameMessageAndSid) return sameMessageAndSid;

  const sameMessage = candidates.find(
    (candidate) => candidate.message === target.message,
  );
  if (sameMessage) return sameMessage;

  if (candidates.length === 1) {
    return candidates[0];
  }

  return null;
}

/**
 * Result of computing a lint fix against a book's CURRENT content. Pure
 * compute (per the withWorkingFilesDraft contract): no store writes here. When
 * a fix applies, `nextUsfm` is the rebuilt book text the mutator feeds back
 * after checking out the book; the caller runs its toast on the typed result,
 * so a stale/gate abort can never publish a "fix applied" effect for a write
 * that didn't land.
 *
 * `fallbackIssues` is the relint computed when the first fix didn't apply (used
 * to re-find the issue whose id/span shifted). It's surfaced so the caller can
 * still refresh the lint panel even on the no-op path — without committing
 * anything mid-mutation.
 */
type LintFixComputeResult =
  | { applied: false; fallbackIssues?: LintIssue[] }
  | { applied: true; nextUsfm: string; fallbackIssues?: LintIssue[] };

export async function applyLintFixToFile(args: {
  err: LintIssue;
  issueFix: TokenFix;
  file: ReadonlyScriptureBookState;
  targetBookCode: string;
  targetChapterNumber: number;
  usfmOnionService: IUsfmOnionService;
}): Promise<LintFixComputeResult> {
  const baselineTokens = args.file.chapters.flatMap((c) => c.currentTokens);
  let activeFix = args.issueFix;
  let result = await args.usfmOnionService.applyTokenFixes(baselineTokens, [
    activeFix,
  ]);

  // The fix targets the token the lint panel pinned earlier. If anything shifted
  // token ids/spans since then — e.g. an earlier fix in this same book
  // renumbered tokens — the click no longer anchors and this first attempt
  // changes nothing. That's the only way in here: recover ONCE by relinting to
  // re-find the same logical issue, then retry with its refreshed fix. The happy
  // path applies on the first call and never enters this block.
  let fallbackIssues: LintIssue[] | undefined;
  if (!result.appliedChanges.length) {
    // Compute-only relint — NOT committed to the lint store here; the no-op
    // path in `fixLintFinding` decides whether to publish it.
    fallbackIssues = await relintBookFile(args.file, args.usfmOnionService);
    const normalizedIssue = findEquivalentIssue(
      fallbackIssues,
      args.err,
      args.targetBookCode,
      args.targetChapterNumber,
    );
    if (!normalizedIssue?.fix) return { applied: false, fallbackIssues };

    activeFix = normalizedIssue.fix;
    result = await args.usfmOnionService.applyTokenFixes(baselineTokens, [
      activeFix,
    ]);
  }

  if (!result.appliedChanges.length) return { applied: false, fallbackIssues };

  // `baselineTokens` came through `lexicalToTokens` (LF-stamped newlines), so
  // the file's own EOL — not the token sources — is the source of truth here.
  const nextUsfm = tokensToUsfm(result.tokens, bookLineEnding(args.file));
  return { applied: true, nextUsfm, fallbackIssues };
}

export type LintFixDeps = {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  history: CustomHistoryHook;
  usfmOnionService: IUsfmOnionService;
  editorMode: EditorModeSetting;
  /**
   * For the no-op fallback path's publish — the one legitimate manual
   * findings write (no commit happened, so no pipeline fires).
   */
  findingsStore: FindingsStore;
};

/**
 * Apply a clicked lint issue's upstream fix as one history transaction:
 * apply the token fix on a scratch, rebuild chapter state, commit through the
 * working-files seam, relint via the pipeline subscribers.
 */
export async function fixLintFinding(err: LintIssue, deps: LintFixDeps) {
  // Crash-recovery gate: suppress programmatic working-state mutations while
  // a save is in flight or a recovery decision is pending. A gated call is a
  // no-op (withWorkingFilesDraft also rechecks at commit time).
  if (!requireGateOpen(deps.interactionGate.get())) return;

  const issueFix = err.fix;
  if (!issueFix) return;
  if (!err.sid) return;
  const localizedFixLabel = formatTokenFixLabel(issueFix);

  const sidParsed = parseSid(err.sid);
  if (!sidParsed) return;

  // applyLintFixToFile rebuilds the whole book (rebuildParsedFileFromUsfm
  // replaces `targetFile.chapters` and may rebuild multiple chapters), so the
  // mutator checks the book out WHOLESALE — the seam commits it as a validated
  // bulk rather than a per-chapter overlay. Lint/diff/editor sync react to the
  // commit via their subscribers; the success toast runs on the typed result,
  // so a save racing this op (which aborts at the gate recheck) can't leave
  // the UI claiming the fix landed.
  const originalFile = deps.workingFilesStore
    .read()
    .find((f) => f.bookCode === sidParsed.book);
  if (!originalFile) {
    console.error(`File not found for book: ${sidParsed.book}`);
    return;
  }
  const targetChapterNumber = sidParsed.chapter;
  if (
    !originalFile.chapters.some((c) => c.chapterNumber === targetChapterNumber)
  ) {
    console.error(`Chapter not found: ${targetChapterNumber}`);
    return;
  }

  const historyToken = deps.history.captureHistory();
  const outcome = await withWorkingFilesDraft({
    workingFilesStore: deps.workingFilesStore,
    interactionGate: deps.interactionGate,
    commitMeta: {
      kind: "programmaticFix",
      action: "lintFix",
      dirtyTextContent: true,
    },
    mutate: async (draft): Promise<LintFixComputeResult> => {
      const file = draft.read().find((f) => f.bookCode === sidParsed.book);
      if (!file) return { applied: false };
      const computed = await applyLintFixToFile({
        err,
        issueFix,
        file,
        targetBookCode: file.bookCode,
        targetChapterNumber,
        usfmOnionService: deps.usfmOnionService,
      });
      if (!computed.applied) return computed;

      // The fix produced changes — check out the book and rebuild it in
      // place from the new USFM (replaces its chapters wholesale).
      const writableFile = draft.bookForWrite(sidParsed.book);
      if (!writableFile) return { applied: false };
      await rebuildParsedFileFromUsfm({
        targetFile: writableFile,
        sourceUsfm: computed.nextUsfm,
        usfmOnionService: deps.usfmOnionService,
        shape: shapeForSurface("workingRebuild", deps.editorMode),
      });
      return computed;
    },
  });

  if (outcome.kind === "committed") {
    deps.history.recordHistory(historyToken, {
      label: t`Apply Autofix (${localizedFixLabel})`,
      affected: outcome.committedChapters,
    });
    showNotificationSuccess({
      notification: {
        title: t`Fix Applied`,
        message: t`Autofix applied for ${localizedFixLabel}`,
      },
    });
  }

  // No-op path: the fix didn't apply, but a fallback relint may have
  // refreshed the issue set. Publish it so the findings surfaces reflect
  // current truth — without having committed mid-mutation (no commit ⇒ no
  // subscriber fires; this is the one legitimate manual findings write).
  if (outcome.kind === "unchanged" && outcome.value.fallbackIssues) {
    deps.findingsStore.commitBookFindings(
      "onion",
      sidParsed.book,
      onionFindingsByChapter(outcome.value.fallbackIssues),
    );
  }
}
