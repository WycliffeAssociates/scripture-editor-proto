import { Effect, PubSub, Stream } from "effect";

import { lexicalToTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

import { makeRecordingDraft } from "./recordingDraft.ts";
import type {
  CapturedSelection,
  CommitEvent,
  CommitMeta,
  WorkingFilesPatch,
} from "./types.ts";

type CommitMetaInput = Omit<CommitMeta, "generation">;
type Listener = () => void;

/** A selection that rode a commit, stamped with that commit's generation. */
export type ChapterSelectionFact = {
  generation: number;
  selection: CapturedSelection | null;
};

/**
 * Single source of live current truth for working-files state.
 *
 * `this.state` is the truth. Two protocols read it:
 *  - React via `subscribe` + `getSnapshot` (used by `useSave`'s
 *    `useSyncExternalStore` for reactive `hasUnsavedChanges`).
 *  - Effect via `changes: Stream<CommitEvent>` (used by Stage 2 pipelines —
 *    lint, save status, structure, overlay tick).
 *
 * A component should pick one channel; using both is a smell — derive into a
 * second store instead.
 */
export class WorkingFilesStore {
  private state: ScriptureBookState[];
  private gen = 0;
  private contentGen = 0;
  private readonly pendingDeletedBooks = new Set<string>();
  private readonly pendingStructurallyChangedBooks = new Set<string>();
  private readonly tickListeners = new Set<Listener>();
  private readonly pubsub: PubSub.PubSub<CommitEvent>;
  /**
   * Per-chapter selection facts (keyed `bookCode:chapterNum`). Selection is
   * a producer fact riding commits (see `CapturedSelection` in types.ts);
   * retention is deliberately tiny — latest only. Latest is sufficient
   * because the single lexical→app listener captures BEFORE it publishes
   * (`WorkingFilesBridgePlugin`), so at capture time the latest fact always
   * describes the world before the in-flight commit.
   */
  private readonly selectionFacts = new Map<string, ChapterSelectionFact>();

  constructor(initial: ScriptureBookState[]) {
    this.state = initial;
    // Unbounded so every CommitEvent reaches every subscriber. Pressure
    // relief is per-subscriber: `Stream.switchMap` (lint) interrupts
    // in-flight work, `Stream.debounce` coalesces bursts. A growing queue
    // means an upstream subscriber is hanging, not that we should bound
    // here.
    this.pubsub = Effect.runSync(PubSub.unbounded<CommitEvent>());
  }

  read(): ScriptureBookState[] {
    return this.state;
  }

  /** Current commit generation — the high-water mark mirror seeds align to. */
  generation(): number {
    return this.gen;
  }

  /** Latest generation whose commit changed scripture content. */
  contentGeneration(): number {
    return this.contentGen;
  }

  pendingStructuralChanges(): {
    deletedBookCodes: readonly string[];
    structurallyChangedBookCodes: readonly string[];
  } {
    return Object.freeze({
      deletedBookCodes: Object.freeze([...this.pendingDeletedBooks]),
      structurallyChangedBookCodes: Object.freeze([
        ...this.pendingStructurallyChangedBooks,
      ]),
    });
  }

  hasPendingStructuralChanges(): boolean {
    return (
      this.pendingDeletedBooks.size > 0 ||
      this.pendingStructurallyChangedBooks.size > 0
    );
  }

  /**
   * Build a writable draft via structural sharing. For each `(bookCode,
   * chapterNum)` in `refs` the containing book and chapter are shallow-
   * copied; everything else aliases current state. Caller mutates the
   * named chapters in place, then commits via
   * `commit({ patch: { kind: "bulk", files: draft }, meta })`.
   *
   * Why not `structuredClone(read())`: deep-cloning the whole project was
   * ~1.5s on Psalm 119 per undo. Structural sharing produces the exact
   * object identities the commit boundary needs — touched paths get new
   * refs, untouched paths stay stable (which also keeps downstream
   * `useMemo` / `React.memo` quiet).
   *
   * Discovery flows (don't know targets yet): walk to collect refs, then
   * draft + mutate in a second pass. Two passes is cheap; deep clone was
   * hundreds of ms.
   *
   * Concurrency: draft → mutate → commit must stay synchronous in one
   * stack frame. An `await` between drafting and committing lets a newer
   * commit land in between; your shared-ref draft will then overwrite it
   * (lost update). Gather async results first, then synchronously draft
   * from the latest `read()` and commit.
   */
  draftWithChapters(
    refs: ReadonlyArray<{ bookCode: string; chapterNum: number }>,
  ): ScriptureBookState[] {
    if (refs.length === 0) return this.state;
    // One copy-on-write codepath: eagerly check out the named chapters on a
    // recording draft and hand back its files. The draft's per-write tracking
    // (originals / wholesale) is discarded here — this door declares its refs
    // up front and the caller mutates the returned copies in place.
    const draft = makeRecordingDraft(this.state);
    for (const ref of refs) {
      draft.chapterForWrite(ref);
    }
    return draft.result().files;
  }

  /**
   * Apply a patch and notify both channels. React listeners run
   * synchronously (so `useSyncExternalStore` snapshots are coherent within
   * a render). The PubSub publish is forked — non-blocking; stream
   * subscribers consume in their own fibers.
   */
  commit(input: { patch: WorkingFilesPatch; meta: CommitMetaInput }): void {
    const { patch, meta } = input;
    this.state = applyPatch(this.state, patch);
    this.updateStructuralChanges(meta);
    freezeCommittedChapters(this.state);
    const fullMeta: CommitMeta = { ...meta, generation: ++this.gen };
    if (fullMeta.dirtyTextContent) this.contentGen = fullMeta.generation;
    this.recordSelectionFacts(patch, fullMeta.generation);
    const event: CommitEvent = {
      meta: fullMeta,
      patch,
      snapshot: this.state,
    };

    for (const tickListener of this.tickListeners) tickListener();
    Effect.runFork(PubSub.publish(this.pubsub, event));
  }

  private updateStructuralChanges(meta: CommitMetaInput): void {
    for (const bookCode of meta.structuralChanges?.deletedBookCodes ?? []) {
      this.pendingDeletedBooks.add(bookCode);
      this.pendingStructurallyChangedBooks.delete(bookCode);
    }
    for (const bookCode of meta.structuralChanges
      ?.structurallyChangedBookCodes ?? []) {
      // A later structural recreation supersedes an earlier pending deletion.
      // Persist the now-present book instead of deleting it on retry.
      this.pendingDeletedBooks.delete(bookCode);
      this.pendingStructurallyChangedBooks.add(bookCode);
    }
    for (const bookCode of meta.resolvedStructuralChanges?.deletedBookCodes ??
      []) {
      this.pendingDeletedBooks.delete(bookCode);
    }
    for (const bookCode of meta.resolvedStructuralChanges
      ?.structurallyChangedBookCodes ?? []) {
      this.pendingStructurallyChangedBooks.delete(bookCode);
    }
  }

  /**
   * Record the selection fact(s) a patch carries. Patches WITHOUT a
   * selection field (programmatic chapter writes, plain bulk commits)
   * leave the facts untouched — absence means "this producer doesn't know
   * the cursor", not "there is no cursor".
   */
  private recordSelectionFacts(
    patch: WorkingFilesPatch,
    generation: number,
  ): void {
    const record = (
      bookCode: string,
      chapter: number,
      selection: CapturedSelection | null,
    ) => {
      this.selectionFacts.set(`${bookCode}:${chapter}`, {
        generation,
        selection,
      });
    };
    switch (patch.kind) {
      case "selectionOnly":
        record(patch.bookCode, patch.chapter, patch.selection);
        return;
      case "chapter":
        if (patch.selection !== undefined) {
          record(patch.bookCode, patch.chapter, patch.selection);
        }
        return;
      case "bulk":
        for (const entry of patch.selections ?? []) {
          record(entry.bookCode, entry.chapter, entry.selection);
        }
        return;
      case "metadata":
        return;
    }
  }

  /** Latest selection fact for a chapter (null if never recorded). */
  readSelectionFact(
    bookCode: string,
    chapter: number,
  ): ChapterSelectionFact | null {
    return this.selectionFacts.get(`${bookCode}:${chapter}`) ?? null;
  }

  /**
   * Replace state wholesale without publishing a commit event. Used by the
   * shadow-mirror bootstrap when the workspace reloads a project. Subscribers
   * that need to react to a fresh project should listen for the route-level
   * load event instead.
   */
  reset(next: ScriptureBookState[]): void {
    this.state = next;
    freezeCommittedChapters(this.state);
    this.selectionFacts.clear();
    this.pendingDeletedBooks.clear();
    this.pendingStructurallyChangedBooks.clear();
  }

  // Bound, like `FindingsStore`'s: these are handed to
  // `useSyncExternalStore` as bare references, and an unbound method loses
  // `this` at that call site.
  /** React-side `useSyncExternalStore` subscribe. */
  subscribe = (listener: Listener): (() => void) => {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  };

  getSnapshot = (): ScriptureBookState[] => this.state;

  /** Effect-side commit stream — pipe with `Stream.filter` / `debounce` /
   * `switchMap`; `Effect.runFork(Stream.runDrain(...))` to start a fiber. */
  get changes(): Stream.Stream<CommitEvent> {
    return Stream.fromPubSub(this.pubsub);
  }
}

/**
 * Dev-only invariant guard for the identity-based staleness contract (see
 * `validatedStoreMutation.commitIfNotStale`): committed chapter state is
 * immutable, and every content commit produces a NEW chapter object. Freezing
 * each committed chapter turns an accidental in-place field write on a chapter
 * read from the store (`chapter.currentTokens = …`, `chapter.dirty = …`) into a
 * loud throw at the offending line, instead of a silent lost-update that the
 * identity check can't see.
 *
 * Cheap by construction: only the CHAPTER OBJECT is frozen (≈6 own props), never
 * its token arrays — `Object.freeze` on an array is O(length), which on Psalm
 * 119 (~1969 tokens) would be a real per-commit cost. Structural sharing keeps
 * unchanged chapters as the same (already-frozen) objects, so a typing commit
 * freezes exactly the one new chapter; the `isFrozen` skip makes the walk O(n)
 * cheap checks, not O(n) freezes. The recording draft shallow-copies a chapter
 * before mutating it, so the COW write path is unaffected. No-op in production.
 */
function freezeCommittedChapters(state: ScriptureBookState[]): void {
  if (!import.meta.env?.DEV) return;
  for (const book of state) {
    for (const chapter of book.chapters) {
      if (!Object.isFrozen(chapter)) Object.freeze(chapter);
    }
  }
}

/**
 * Look up a chapter in a draft (or any `ScriptureBookState[]`) by
 * (bookCode, chapterNumber). Returns the chapter object you can mutate
 * if you built the draft via `draftWithChapters` and included this ref.
 */
export function findChapterInDraft(
  draft: ScriptureBookState[],
  bookCode: string,
  chapterNum: number,
): ScriptureChapterState | null {
  const book = draft.find((b) => b.bookCode === bookCode);
  if (!book) return null;
  return book.chapters.find((c) => c.chapterNumber === chapterNum) ?? null;
}

/**
 * Apply a patch to the working-files state. Pure function: returns a new array
 * when the patch hits, leaves untouched references for other entries.
 */
function applyPatch(
  state: ScriptureBookState[],
  patch: WorkingFilesPatch,
): ScriptureBookState[] {
  switch (patch.kind) {
    case "bulk":
      return patch.files;
    case "selectionOnly":
      return state;
    case "chapter": {
      const { bookCode, chapter, lexicalState } = patch;
      return state.map((book) => {
        if (book.bookCode !== bookCode) return book;
        return {
          ...book,
          chapters: book.chapters.map((c) => {
            if (c.chapterNumber !== chapter) return c;
            // The edit arrives as a shaped lexical state; we flatten it to the
            // canonical token stream and store only that — shape is re-derived
            // on read. Direction is a chapter property and doesn't change here.
            const currentTokens = lexicalToTokens(lexicalState, {
              bookCode,
            });
            // Content-derived dirty: matches legacy
            // updateChapterLexical so undo-to-clean still flips
            // back to false.
            const dirty = !tokenSourcesEqual(currentTokens, c.sourceTokens);
            return { ...c, currentTokens, dirty };
          }),
        };
      });
    }
    case "metadata": {
      const { bookCode, chapter, dirty } = patch;
      return state.map((book) => {
        if (book.bookCode !== bookCode) return book;
        return {
          ...book,
          chapters: book.chapters.map((c) => {
            if (c.chapterNumber !== chapter) return c;
            return { ...c, dirty };
          }),
        };
      });
    }
  }
}

/**
 * Compare two token arrays by their `source` strings concatenated.
 *
 * Matches the legacy dirty-flag derivation in `updateChapterLexical` so that
 * undo-back-to-baseline still flips `dirty` to false. The concatenated string
 * comparison is O(n) in token count plus a single string equality check; on
 * Psalm 119's 1969 tokens this is well under a millisecond and dominated by
 * the surrounding `lexicalToTokens` call (~5 ms).
 */
function tokenSourcesEqual(a: Token[], b: Token[]): boolean {
  if (a.length !== b.length) return false;
  let aJoined = "";
  let bJoined = "";
  for (let i = 0; i < a.length; i++) {
    aJoined += a[i].source;
    bJoined += b[i].source;
  }
  return aJoined === bJoined;
}
