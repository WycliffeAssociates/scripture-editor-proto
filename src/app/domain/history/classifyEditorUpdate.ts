// classifyEditorUpdate.ts
//
// The pure decision at the heart of captureEditorUpdate: given the shape of a
// content-changing Lexical commit, what should the history layer DO? Pure so the
// decision is testable without a mounted editor, and so the (subtle) ordering
// lives as a single table.
//
// `history-merge` is single-dispatch: guardrail write-backs ride the typing
// entry they guarded (so undo doesn't discard guardrail work) and NEVER
// record an entry of their own — a fixup with no entry to ride stays out of
// undo entirely (it re-derives from content, so replay doesn't need it).
//
// The selection-only path (no dirty content) is handled UPSTREAM of this
// classifier — it returns before snapshots are computed — so it is not modeled
// here.

export type EditorContentUpdateAction =
    | { kind: "first-snapshot" }
    | { kind: "no-op" }
    | { kind: "history-merge" }
    | { kind: "programmatic-ignore" }
    | { kind: "record-typing" };

export function classifyEditorContentUpdate(input: {
    /** Is there a prior baseline snapshot for this chapter? */
    hasBeforeSnapshot: boolean;
    /** Does the new snapshot equal the baseline (no real content change)? */
    snapshotsEqual: boolean;
    /** Carries the `historyMerge` editor tag. */
    isHistoryMerge: boolean;
    /** Carries the `programaticIgnore` editor tag. */
    isProgrammaticIgnore: boolean;
}): EditorContentUpdateAction {
    // First time we see this chapter: adopt the snapshot as the baseline, don't
    // record an entry.
    if (!input.hasBeforeSnapshot) return { kind: "first-snapshot" };
    // Content didn't actually change (e.g. a re-serialization round-trip): just
    // refresh the baseline selection upstream.
    if (input.snapshotsEqual) return { kind: "no-op" };
    // Merge tag: fold into the latest entry (when one exists for the
    // chapter); never an entry of its own.
    if (input.isHistoryMerge) {
        return { kind: "history-merge" };
    }
    // Programmatic edit we don't want in history: advance baseline, no entry.
    if (input.isProgrammaticIgnore) return { kind: "programmatic-ignore" };
    // Ordinary user typing.
    return { kind: "record-typing" };
}
