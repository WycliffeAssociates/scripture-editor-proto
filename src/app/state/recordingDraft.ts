// recordingDraft.ts
//
// The change-tracking draft for working-files mutations: obtaining write
// access IS the bookkeeping. A mutator reads the draft with plain reads, runs
// its engine, and — only when the engine actually produced a change — checks
// out a writable copy of the chapter (or whole book) it is about to write.
// `result()` then reports exactly what was checked out, so `affected` is
// MEASURED, not claimed.
//
// It is a checkout counter, not a proxy: `chapterForWrite` doesn't ask "may I
// write?" — it hands back the writable copy and records the checkout. The same
// shallow structural copy-on-write the store uses for its drafts (array → book
// → chapter, each copied at most once) is applied here lazily on first write,
// so untouched paths keep store identity and downstream memoization stays
// quiet. Re-checkout is idempotent — a second call for the same ref returns the
// same copy, so multi-pass mutators just work.
//
// Read enforcement is the type system: `read()` returns readonly state, so the
// only mutable door is checkout. The draft adds no `Object.freeze` wall of its
// own — its snapshot objects ARE the store's live objects, and checkout hands
// back a fresh copy to mutate. (The store separately freezes committed chapter
// objects in dev as a runtime backstop for the identity contract; that is
// compatible here — checkout copies before writing, so a frozen committed
// object is only ever read through this draft, never mutated.)

import type {
  ReadonlyScriptureBookState,
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";

import type { CommitChapterRef } from "./types.ts";

export type ReadonlyBookState = ReadonlyScriptureBookState;

export type RecordingDraftResult = {
  /** The next working-files state — copies where written, snapshot elsewhere. */
  files: ScriptureBookState[];
  /**
   * The chapters actually written. Wholesale books report their POST-state
   * chapters (a rebuild may have added or removed some), mirroring
   * `chapterRefsForBook` over the post-state book.
   */
  affected: CommitChapterRef[];
  /**
   * Book codes checked out wholesale via `bookForWrite` (chapters array
   * replaced). Any present ⇒ the commit is a validated bulk, not a per-chapter
   * overlay. Empty ⇒ a pure chapter overlay.
   */
  wholesaleBooks: Set<string>;
  /**
   * Pre-state chapter numbers per wholesale book (from the snapshot the draft
   * branched off). Compared against the post-state chapters to detect a chapter
   * SET change (added/removed) — the `{ project: true }` trigger.
   */
  wholesaleOriginalChapterNums: Map<string, Set<number>>;
};

export type RecordingDraft = {
  /** Coherent merged view: writable copies where checked out, snapshot elsewhere. */
  read(): ReadonlyArray<ReadonlyBookState>;
  /**
   * Check out a writable chapter copy. Null only when no chapter matches `ref`
   * in the current state — i.e. a ref sourced from OUTSIDE this draft (a
   * discovery flow, a stale/derived ref, an incoming apply naming a chapter
   * that doesn't exist yet). A ref you just obtained from `read()` is never
   * null; the nullable return guards the cases where the ref came from elsewhere.
   */
  chapterForWrite(ref: CommitChapterRef): ScriptureChapterState | null;
  /**
   * Check out a whole book for wholesale rebuild (replacing its `chapters`
   * array). Every current chapter is checked out for its pre-image; the book is
   * marked wholesale so `result()` reports its post-state chapters.
   */
  bookForWrite(bookCode: string): ScriptureBookState | null;
  result(): RecordingDraftResult;
};

const key = (ref: CommitChapterRef) => `${ref.bookCode}:${ref.chapterNum}`;

export function makeRecordingDraft(
  snapshot: ScriptureBookState[],
): RecordingDraft {
  const touched = new Map<string, CommitChapterRef>();
  const bookCopies = new Map<string, ScriptureBookState>();
  const wholesaleBooks = new Set<string>();
  let files = snapshot; // becomes a copy on first write

  function chapterForWrite(
    ref: CommitChapterRef,
  ): ScriptureChapterState | null {
    const k = key(ref);
    if (touched.has(k)) {
      return (
        bookCopies
          .get(ref.bookCode)
          ?.chapters.find((c) => c.chapterNumber === ref.chapterNum) ?? null
      );
    }

    const book = snapshot.find((b) => b.bookCode === ref.bookCode);
    const chapter = book?.chapters.find(
      (c) => c.chapterNumber === ref.chapterNum,
    );
    if (!book || !chapter) return null;

    // Shallow COW, three levels, each exactly once: array → book → chapter.
    if (files === snapshot) files = [...snapshot];
    let bookCopy = bookCopies.get(ref.bookCode);
    if (!bookCopy) {
      bookCopy = { ...book, chapters: [...book.chapters] };
      bookCopies.set(ref.bookCode, bookCopy);
      files[files.indexOf(book)] = bookCopy;
    }
    const chapterCopy = { ...chapter };
    bookCopy.chapters[bookCopy.chapters.indexOf(chapter)] = chapterCopy;

    touched.set(k, ref);
    return chapterCopy;
  }

  const wholesaleOriginalChapterNums = new Map<string, Set<number>>();

  function bookForWrite(bookCode: string): ScriptureBookState | null {
    const book = snapshot.find((b) => b.bookCode === bookCode);
    if (!book) return null;
    for (const c of book.chapters) {
      chapterForWrite({ bookCode, chapterNum: c.chapterNumber });
    }
    wholesaleBooks.add(bookCode);
    wholesaleOriginalChapterNums.set(
      bookCode,
      new Set(book.chapters.map((c) => c.chapterNumber)),
    );
    return bookCopies.get(bookCode) ?? null;
  }

  return {
    read: () => files as ReadonlyArray<ReadonlyBookState>,
    chapterForWrite,
    bookForWrite,
    result: () => ({
      files,
      affected: [
        ...[...touched.values()].filter((r) => !wholesaleBooks.has(r.bookCode)),
        ...[...wholesaleBooks].flatMap((b) =>
          (bookCopies.get(b)?.chapters ?? []).map((c) => ({
            bookCode: b,
            chapterNum: c.chapterNumber,
          })),
        ),
      ],
      wholesaleBooks,
      wholesaleOriginalChapterNums,
    }),
  };
}
