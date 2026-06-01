// classifyEditorUpdate.ts
//
// The pure decision at the heart of captureEditorUpdate: given the shape of a
// content-changing Lexical commit, what should the history layer DO? Pure so the
// decision is testable without a mounted editor, and so the (subtle) ordering
// lives as a single table.
//
// NOTE the `history-merge` fall-through: a `historyMerge` commit that is NOT
// also `programaticIgnore` merges into the latest entry AND then records a
// typing change (`alsoRecordTyping: true`). It is not a clean single-dispatch,
// so the dispatcher must honor `alsoRecordTyping`.
//
// The selection-only path (no dirty content) is handled UPSTREAM of this
// classifier — it returns before snapshots are computed — so it is not modeled
// here.

export type EditorContentUpdateAction =
    | { kind: "first-snapshot" }
    | { kind: "no-op" }
    | { kind: "history-merge"; alsoRecordTyping: boolean }
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
    // Merge tag: fold into the latest entry. Without programaticIgnore the
    // original flow ALSO falls through to record a typing change.
    if (input.isHistoryMerge) {
        return {
            kind: "history-merge",
            alsoRecordTyping: !input.isProgrammaticIgnore,
        };
    }
    // Programmatic edit we don't want in history: advance baseline, no entry.
    if (input.isProgrammaticIgnore) return { kind: "programmatic-ignore" };
    // Ordinary user typing.
    return { kind: "record-typing" };
}
