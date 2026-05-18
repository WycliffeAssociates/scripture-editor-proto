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

export type CommitScope =
    | { bookCode: string; chapter: number }
    | { project: true };

export type CommitMeta = {
    kind: CommitKind;
    scope: CommitScope;
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

export type WorkingFilesPatch =
    | {
          kind: "chapter";
          bookCode: string;
          chapter: number;
          /**
           * Either an already-materialized lexical state, or a thunk that produces
           * one on demand. The thunk form lets the editor bridge publish every
           * commit (including selection-only) without paying `toJSON` cost when
           * no subscriber materializes the patch.
           */
          lexicalState:
              | SerializedLexicalChapterState
              | (() => SerializedLexicalChapterState);
      }
    | {
          kind: "metadata";
          bookCode: string;
          chapter: number;
          dirty: boolean;
      }
    | { kind: "bulk"; files: ScriptureBookState[] };

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
