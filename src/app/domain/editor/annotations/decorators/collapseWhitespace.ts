// collapseWhitespace.ts
//
// The sous `lex.excess-h-whitespace` fix as a plain domain function,
// co-located with the decorator that exposes it (see decorateFinding.tsx) —
// the sibling of lintFix.ts on the content side. sous flags excess whitespace
// in the verse's CONTENT stream (the vref projection, which omits callouts like
// footnotes), so a flagged run can legitimately straddle a marker: ", " · \f…\f*
// · " and" reads as two adjacent content spaces. The fix collapses the whole
// run to a single content space, distributing the edit across every touched
// token — the surviving space lands in the first, the rest are removed.

import { t } from "@lingui/core/macro";

import { type EditorModeSetting, shapeForSurface } from "@/app/data/editor.ts";
import type { Finding } from "@/app/domain/editor/annotations/finding.ts";
import { resolveContentTokenSlices } from "@/app/domain/editor/annotations/resolveContentRange.ts";
import { rebuildParsedFileFromUsfm } from "@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts";
import {
  bookLineEnding,
  tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { withWorkingFilesDraft } from "@/app/domain/project/workingFileCommand.ts";
import { sousSegmentsForBook } from "@/app/state/findingsSelectors.ts";
import type { FindingsStore } from "@/app/state/FindingsStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
import { showNotificationSuccess } from "@/app/ui/components/primitives/notifications.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

type SousFinding = Extract<Finding, { source: "sous-chef" }>;

export type CollapseWhitespaceDeps = {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  history: CustomHistoryHook;
  usfmOnionService: IUsfmOnionService;
  editorMode: EditorModeSetting;
  /** Source of the sous segment sidecar the finding's range resolves against. */
  findingsStore: FindingsStore;
};

type TokenEdit = { localStart: number; localEnd: number; replacement: string };

/**
 * Collapse the whitespace run a `lex.excess-h-whitespace` finding flags down to
 * one space, as a single history transaction through the working-files seam.
 * No-ops (without committing) if the gate is closed, the range can't be
 * resolved to tokens, or any touched slice no longer reads as pure whitespace
 * (a stale segment map) — never corrupts real text.
 */
export async function collapseExcessWhitespace(
  finding: SousFinding,
  deps: CollapseWhitespaceDeps,
) {
  if (!requireGateOpen(deps.interactionGate.get())) return;

  const anchor = finding.anchor;
  if (anchor.kind !== "content") return;
  const sid = parseSid(anchor.sid);
  if (!sid) return;

  const segments = sousSegmentsForBook(deps.findingsStore.read(), sid.book);
  const slices = resolveContentTokenSlices(anchor.sid, anchor.range, segments);
  if (!slices.length) return;

  // The surviving single space lands in the first touched token; every later
  // touched token's portion of the run is deleted. One segment per token, so
  // tokenIds are unique across slices.
  const edits = new Map<string, TokenEdit>();
  slices.forEach((slice, i) => {
    edits.set(slice.tokenId, {
      localStart: slice.localStart,
      localEnd: slice.localEnd,
      replacement: i === 0 ? " " : "",
    });
  });

  const historyToken = deps.history.captureHistory();
  const outcome = await withWorkingFilesDraft({
    workingFilesStore: deps.workingFilesStore,
    interactionGate: deps.interactionGate,
    commitMeta: {
      kind: "programmaticFix",
      action: "collapseWhitespace",
      dirtyTextContent: true,
    },
    mutate: async (draft) => {
      const file = draft.read().find((f) => f.bookCode === sid.book);
      if (!file) return { applied: false };

      let applied = 0;
      const nextTokens: Token[] = file.chapters
        .flatMap((c) => c.currentTokens)
        .map((token) => {
          const edit = token.id ? edits.get(token.id) : undefined;
          if (!edit) return token;
          const source = token.source ?? "";
          const sliced = source.slice(edit.localStart, edit.localEnd);
          // Guard against a stale segment map pointing at real text.
          if (edit.localEnd > source.length || !/^\s+$/u.test(sliced)) {
            return token;
          }
          applied++;
          return {
            ...token,
            source:
              source.slice(0, edit.localStart) +
              edit.replacement +
              source.slice(edit.localEnd),
          };
        });

      // Every touched token must have edited cleanly, or we don't commit —
      // a partial collapse would leave inconsistent spacing.
      if (applied !== edits.size) return { applied: false };

      const writable = draft.bookForWrite(sid.book);
      if (!writable) return { applied: false };
      await rebuildParsedFileFromUsfm({
        targetFile: writable,
        sourceUsfm: tokensToUsfm(nextTokens, bookLineEnding(file)),
        usfmOnionService: deps.usfmOnionService,
        shape: shapeForSurface("workingRebuild", deps.editorMode),
      });
      return { applied: true };
    },
  });

  if (outcome.kind === "committed") {
    deps.history.recordHistory(historyToken, {
      label: t`Collapse extra spaces`,
      affected: outcome.committedChapters,
    });
    showNotificationSuccess({
      notification: {
        title: t`Fix Applied`,
        message: t`Collapsed extra spaces to one.`,
      },
    });
  }
}
