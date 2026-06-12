import { Effect, PubSub, Stream } from "effect";

import { lexicalToTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

import type {
  CapturedSelection,
  CommitEvent,
  CommitMeta,
  SerializedLexicalChapterState,
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

  readChapter(
    bookCode: string,
    chapter: number,
  ): SerializedLexicalChapterState | undefined {
    return this.state
      .find((f) => f.bookCode === bookCode)
      ?.chapters.find((c) => c.chapterNumber === chapter)?.lexicalState;
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
    const touchedBooks = new Set<string>();
    const touchedChapterKeys = new Set<string>();
    for (const ref of refs) {
      touchedBooks.add(ref.bookCode);
      touchedChapterKeys.add(`${ref.bookCode}:${ref.chapterNum}`);
    }
    return this.state.map((book) => {
      if (!touchedBooks.has(book.bookCode)) return book;
      return {
        ...book,
        chapters: book.chapters.map((c) =>
          touchedChapterKeys.has(`${book.bookCode}:${c.chapterNumber}`)
            ? { ...c }
            : c,
        ),
      };
    });
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
    const fullMeta: CommitMeta = { ...meta, generation: ++this.gen };
    this.recordSelectionFacts(patch, fullMeta.generation);
    const event: CommitEvent = {
      meta: fullMeta,
      patch,
      snapshot: this.state,
    };

    for (const tickListener of this.tickListeners) tickListener();
    Effect.runFork(PubSub.publish(this.pubsub, event));
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
    this.selectionFacts.clear();
  }

  /** React-side `useSyncExternalStore` subscribe (used by `useSave`). */
  subscribe(listener: Listener): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  getSnapshot(): ScriptureBookState[] {
    return this.state;
  }

  /** Effect-side commit stream — pipe with `Stream.filter` / `debounce` /
   * `switchMap`; `Effect.runFork(Stream.runDrain(...))` to start a fiber. */
  get changes(): Stream.Stream<CommitEvent> {
    return Stream.fromPubSub(this.pubsub);
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
            const currentTokens = lexicalToTokens(lexicalState, {
              bookCode,
            });
            // Content-derived dirty: matches legacy
            // updateChapterLexical so undo-to-clean still flips
            // back to false.
            const dirty = !tokenSourcesEqual(currentTokens, c.sourceTokens);
            return { ...c, lexicalState, currentTokens, dirty };
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
