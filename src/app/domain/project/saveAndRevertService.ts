import type { EditorShape } from "@/app/data/editor.ts";
import {
  serializeChaptersToUsfm,
  tokensToLexical,
  tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { BookRef } from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Save/revert operations work on the scripture workspace noun after editing has
 * already happened. This module is the boundary where dirty chapter state is
 * compared against its loaded baseline and converted back into save payloads or
 * reverted lexical state.
 */
export function isChapterDirtyUsfm(chapter: ScriptureChapterState): boolean {
  // TODO(usfm-onion): this token-based dirty check is pure USFM logic and
  // belongs behind the crate boundary.
  return (
    tokensToUsfm(chapter.currentTokens, chapter.eol) !==
    tokensToUsfm(chapter.sourceTokens, chapter.eol)
  );
}

// Revert a chapter to its last-SAVED baseline. `sourceTokens` IS that baseline
// (it advances on every save, not just at file open), so we rebuild lexical
// state from it in the caller's `shape` — the `workingRebuild` surface the user
// is looking at.
export function revertChapterToLoadedState(
  chapter: ScriptureChapterState,
  shape: EditorShape,
) {
  chapter.lexicalState = tokensToLexical({
    tokens: chapter.sourceTokens,
    direction:
      (chapter.lexicalState.root.direction ?? "ltr") === "rtl" ? "rtl" : "ltr",
    mode: shape,
  });
  chapter.currentTokens = structuredClone(chapter.sourceTokens);
  chapter.dirty = false;
}

export async function revertChapterDiffByBlockId(args: {
  chapter: ScriptureChapterState;
  diffBlockId: string;
  usfmOnionService: IUsfmOnionService;
  shape: EditorShape;
}) {
  const baselineTokens = args.chapter.sourceTokens;
  const currentTokens = args.chapter.currentTokens;

  const nextTokens = await args.usfmOnionService.revertDiffBlock(
    baselineTokens,
    currentTokens,
    args.diffBlockId,
  );

  const direction =
    (args.chapter.lexicalState.root.direction ?? "ltr") === "rtl"
      ? "rtl"
      : "ltr";

  args.chapter.lexicalState = tokensToLexical({
    tokens: nextTokens,
    direction,
    mode: args.shape,
  });
  args.chapter.currentTokens = nextTokens;
  args.chapter.dirty = isChapterDirtyUsfm(args.chapter);
}

export function buildBooksSavePayload(
  files: ScriptureBookState[],
): Record<string, string> {
  // TODO(usfm-onion): `serializeChaptersToUsfm` belongs behind the crate
  // boundary once app/UI orchestration is fully separated.
  const toSave: Record<string, string> = {};
  for (const file of files) {
    const shouldSaveBook = file.chapters.some((chapter) => chapter.dirty);
    if (!shouldSaveBook) continue;

    toSave[file.bookCode] = serializeChaptersToUsfm(
      file.chapters,
      (chapter) => chapter.currentTokens,
    );
  }
  return toSave;
}

const BOOK_PERSISTENCE_ACTION_VALUES = ["saveExisting", "addNew"] as const;

export const [
  BOOK_PERSISTENCE_ACTION_SAVE_EXISTING,
  BOOK_PERSISTENCE_ACTION_ADD_NEW,
] = BOOK_PERSISTENCE_ACTION_VALUES;

export type BookPersistenceAction =
  | {
      kind: typeof BOOK_PERSISTENCE_ACTION_SAVE_EXISTING;
      bookCode: string;
      storageKey: string;
      contents: string;
    }
  | {
      kind: typeof BOOK_PERSISTENCE_ACTION_ADD_NEW;
      bookCode: string;
      contents: string;
    };

export function buildBookPersistencePlan(args: {
  existingBooks: Pick<BookRef, "bookCode" | "storageKey">[];
  payload: Record<string, string>;
}): BookPersistenceAction[] {
  const existingByBookCode = new Map(
    args.existingBooks.map((book) => [book.bookCode, book.storageKey]),
  );

  return Object.entries(args.payload).map(([bookCode, contents]) => {
    const storageKey = existingByBookCode.get(bookCode);
    if (storageKey) {
      return {
        kind: BOOK_PERSISTENCE_ACTION_SAVE_EXISTING,
        bookCode,
        storageKey,
        contents,
      };
    }

    return {
      kind: BOOK_PERSISTENCE_ACTION_ADD_NEW,
      bookCode,
      contents,
    };
  });
}

/**
 * Rebase a chapter's saved baseline to the EXACT tokens persisted to disk for
 * this save, captured at the save snapshot — deliberately NOT the chapter's live
 * `currentTokens`.
 *
 * Why this matters: the save flow awaits git commit + remote publish between
 * taking the snapshot and marking chapters clean. A programmatic mutation
 * (toolbar action, lint fix, remote sync) or a stray editor edit can change
 * `currentTokens` in that window. `markFilesAsSaved` rebases to `currentTokens`,
 * which would mark the chapter clean against bytes that were never written —
 * silent divergence between the in-memory "saved" state and disk. Rebasing to
 * the captured tokens keeps `sourceTokens` == disk, then re-derives `dirty` so a
 * post-snapshot edit correctly stays dirty for the next save. This holds
 * regardless of which subsystem caused the mutation, with no UI involved.
 */
export function rebaseChapterToCapturedSave(
  chapter: ScriptureChapterState,
  captured: { tokens: Token[] },
): ScriptureChapterState {
  const rebased: ScriptureChapterState = {
    ...chapter,
    sourceTokens: captured.tokens,
  };
  return { ...rebased, dirty: isChapterDirtyUsfm(rebased) };
}

export function markFilesAsSaved(files: ScriptureBookState[]) {
  for (const file of files) {
    for (const chapter of file.chapters) {
      chapter.sourceTokens = structuredClone(chapter.currentTokens);
      chapter.dirty = false;
    }
  }
}
