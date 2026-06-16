import type { SerializedEditorState, SerializedLexicalNode } from "lexical";

import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";

export type SerializedLexicalChapterState =
  SerializedEditorState<SerializedLexicalNode>;

/**
 * Why a commit happened. Subscribers filter on this to decide whether to react.
 *
 * `userEdit`         — user typed / pasted / deleted content.
 * `programmaticFix`  — a fix-it action (lint fix, format-match, prettify) wrote back.
 * `import`           — content brought in from outside (USFM paste, version revert, file open).
 * `undo` / `redo`    — history replay.
 * `load`             — chapter / project initial population. Subscribers usually filter this out.
 * `structuralFixup`  — structure-maintenance write-back. Filtered out by structure-maintenance
 *                      itself to prevent feedback loops.
 * `metadataOnly`     — dirty flag flipped or selection-only commit. No text changed.
 */
export type CommitKind =
  | "userEdit"
  | "programmaticFix"
  | "import"
  | "undo"
  | "redo"
  | "load"
  | "structuralFixup"
  | "metadataOnly";

/**
 * Structurally identical to `ChapterRef` (domain/project) — duplicated here so
 * the state layer's event types don't import from the domain layer. TS
 * structural typing makes the two interchangeable at call sites.
 */
export type CommitChapterRef = { bookCode: string; chapterNum: number };

/**
 * WHAT a commit changed — a fact, not a reaction policy. Subscribers own their
 * expansion (lint widens chapters→books, sous may widen to the whole project,
 * diff stays per-chapter).
 *
 * `{ chapters }`      — exactly these chapters' content may have changed;
 *                       everything else is untouched.
 * `{ project: true }` — whole-snapshot semantics: reconcile against the entire
 *                       post-commit snapshot INCLUDING absences. Kept as a
 *                       sentinel (not "list of every chapter") because a list
 *                       cannot express removal — version switch / import can
 *                       drop books, and consumers must know to wipe their
 *                       state for books no longer present.
 */
export type CommitScope = { chapters: CommitChapterRef[] } | { project: true };

/**
 * WHICH named verb produced a commit — the granular channel beside the coarse
 * `kind`. `kind` serves whole-class discrimination (skip `metadataOnly`,
 * skip `structuralFixup`); `action` serves per-verb policies (e.g. sous maps
 * `chapterLabelStandardize` → project-wide re-analysis because chapter-label
 * consistency is a cross-book statistical judgment).
 *
 * Granularity principle: `action` names the VERB; `scope` carries the EXTENT.
 * Just `"prettify"` — never `prettifyBook` / `prettifyProject`, which would
 * encode the same fact twice and drift.
 */
export type CommitAction =
  | "chapterLabelStandardize"
  | "lintFix"
  | "prettify"
  | "formatMatch"
  | "modeSwitch"
  | "versionRevert"
  | "revertHunk"
  | "revertChapter"
  | "revertAll"
  | "applyIncoming"
  | "incomingReconciliation"
  | "discardRecoveredWork"
  | "saveCleanMark";

export type CommitMeta = {
  kind: CommitKind;
  scope: CommitScope;
  /** Granular verb identity; present on programmatic mutations. */
  action?: CommitAction;
  /**
   * True iff this commit changed visible text content. Selection-only commits
   * and dirty-flag flips set this to false so e.g. lint can filter them out
   * cheaply without paying the cost of materializing the patch.
   */
  dirtyTextContent: boolean;
  /**
   * Monotonic, strictly increasing per-store. Useful for ordering, deduping,
   * and dev-mode assertions.
   */
  generation: number;
};

/**
 * A selection snapshot keyed by USFMTextNode `data-id` rather than Lexical
 * key: Lexical keys regenerate on every `parseEditorState`, so key-based
 * serializations can't survive undo/redo replays. `data-id` is preserved
 * across re-serialization, so a CapturedSelection re-resolves if the
 * anchor/focus nodes still exist in the target tree.
 *
 * Selection is a commit fact: patches carry it (`null` = no readable
 * selection at commit time — an honest "unknown", never a stale guess), and
 * the store retains the latest fact per chapter. Consumers: undo/redo's
 * selection-restore fallback; anticipated — action palette context, synced
 * scrolling.
 */
export type CapturedSelection = {
  anchorId: string;
  anchorOffset: number;
  focusId: string;
  focusOffset: number;
};

export type WorkingFilesPatch =
  | {
      kind: "chapter";
      bookCode: string;
      chapter: number;
      lexicalState: SerializedLexicalChapterState;
      /**
       * Selection riding the content commit (= selectionAfter for this
       * generation). Optional: programmatic writers (revert, fix-its)
       * that don't know the cursor omit it and leave the fact unchanged.
       */
      selection?: CapturedSelection | null;
    }
  | {
      kind: "metadata";
      bookCode: string;
      chapter: number;
      dirty: boolean;
    }
  | {
      kind: "bulk";
      files: ScriptureBookState[];
      /**
       * Per-chapter selection facts riding a bulk commit — undo/redo
       * replay restores chapter content and the selection that goes with
       * it in one atomic commit.
       */
      selections?: Array<{
        bookCode: string;
        chapter: number;
        selection: CapturedSelection | null;
      }>;
    }
  /**
   * Pure event signal — selection or other no-content-change update. State
   * is unchanged; `applyPatch` returns the same array. Consumers reading
   * `event.meta.kind === "metadataOnly"` can react to selection movement
   * (e.g. synced scrolling) without paying any commit-side cost.
   */
  | {
      kind: "selectionOnly";
      bookCode: string;
      chapter: number;
      selection: CapturedSelection | null;
    };

export type CommitEvent = {
  meta: CommitMeta;
  patch: WorkingFilesPatch;
  /**
   * Post-commit snapshot of the entire working-files state. Subscribers that
   * need a coherent read can use this; subscribers that only care about the
   * patch can ignore it. Reference identity is shared across subscribers in
   * the same tick.
   */
  snapshot: ScriptureBookState[];
};
