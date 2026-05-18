import { Effect, PubSub, Stream } from "effect";
import { lexicalToTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type {
    CommitEvent,
    CommitMeta,
    SerializedLexicalChapterState,
    WorkingFilesPatch,
} from "./types.ts";

type CommitMetaInput = Omit<CommitMeta, "generation">;
type Listener = () => void;

/**
 * Single source of live current truth for working-files state.
 *
 * Replaces the pull-based `mutWorkingFilesRef` + `saveCurrentDirtyLexical()`
 * coordination. Editor commits push here via the bridge plugin; consumers
 * either pull (`read*`) or subscribe.
 *
 * ## One source of truth, two read protocols
 *
 * `this.state` is the truth. `subscribe`/`getSnapshot` and `changes` are two
 * different *protocols* for reading or reacting to that truth — they are not
 * two independent stores and they cannot disagree.
 *
 *  - **React channel** — plain `Set<() => void>` exposed via `subscribe` /
 *    `getSnapshot`. Exists solely to satisfy React's `useSyncExternalStore`
 *    contract: a synchronous "the value changed" callback paired with a
 *    synchronous "give me the current value" read. This pair is what makes
 *    concurrent React renders tear-free when reading external mutable state.
 *    No hooks currently consume this — most React surfaces either read once
 *    at action time (`workingFilesStore.read()`) or subscribe via the Effect
 *    channel below and project into a derived React-facing store. The pair
 *    is kept on the API so a future component that genuinely needs reactive
 *    working-files reads can wire `useSyncExternalStore` directly without
 *    adding a derived store layer.
 *
 *  - **Effect channel** — `PubSub<CommitEvent>` exposed as `changes:
 *    Stream<CommitEvent>`. The expected consumer shape for Stage 2 pipelines
 *    (lint, save status, structure maintenance, overlay tick): a forked
 *    fiber that filters/debounces/switchMaps commits, does its work, and
 *    writes results into its own derived store (e.g. `LintStore`,
 *    `SaveStatusStore`). Those derived stores then expose React-facing
 *    reads. Streams compose; callbacks don't — that's why this channel
 *    exists alongside the simpler React one.
 *
 * If a component finds itself needing both a `useSyncExternalStore` read of
 * working files *and* a stream subscription, that's a smell — it should be
 * one or the other, with a derived store sitting between them.
 */
export class WorkingFilesStore {
    private state: ScriptureBookState[];
    private gen = 0;
    private readonly tickListeners = new Set<Listener>();
    private readonly pubsub: PubSub.PubSub<CommitEvent>;

    constructor(initial: ScriptureBookState[]) {
        this.state = initial;
        // Unbounded by design: every CommitEvent must reach every subscriber
        // (dropping commits would let derived state diverge from `this.state`).
        // The pressure-relief mechanism is per-subscriber operator choice —
        // `Stream.switchMap` (lint) interrupts in-flight work, `Stream.debounce`
        // coalesces bursts. If a subscriber accumulates (e.g. save uses
        // `mapEffect` and a save hangs), the queue grows. Stage 2A will add a
        // dev-mode `PubSub.size` watcher that logs when the backlog exceeds a
        // threshold — treat any overflow as a bug in the offending subscriber's
        // pipeline, not as a reason to bound here.
        this.pubsub = Effect.runSync(PubSub.unbounded<CommitEvent>());
    }

    read(): ScriptureBookState[] {
        return this.state;
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
     * Apply a patch and notify both channels. React listeners run
     * synchronously (so `useSyncExternalStore` snapshots are coherent within
     * a render). The PubSub publish is forked — non-blocking; stream
     * subscribers consume in their own fibers.
     */
    commit(patch: WorkingFilesPatch, meta: CommitMetaInput): void {
        this.state = applyPatch(this.state, patch);
        const fullMeta: CommitMeta = { ...meta, generation: ++this.gen };
        const event: CommitEvent = {
            meta: fullMeta,
            patch,
            snapshot: this.state,
        };

        for (const tickListener of this.tickListeners) tickListener();
        Effect.runFork(PubSub.publish(this.pubsub, event));
    }

    /**
     * Replace state wholesale without publishing a commit event. Used by the
     * shadow-mirror bootstrap when the workspace reloads a project. Subscribers
     * that need to react to a fresh project should listen for the route-level
     * load event instead.
     */
    reset(next: ScriptureBookState[]): void {
        this.state = next;
    }

    /**
     * Plain-tick subscription for React via `useSyncExternalStore`. Listeners
     * receive no payload; they re-read via `getSnapshot`.
     */
    subscribe(listener: Listener): () => void {
        this.tickListeners.add(listener);
        return () => this.tickListeners.delete(listener);
    }

    getSnapshot(): ScriptureBookState[] {
        return this.state;
    }

    /**
     * Effect-side commit stream. Composes with `Stream.filter`,
     * `Stream.debounce`, `Stream.switchMap`, etc. Use `Effect.runFork` on a
     * `Stream.runForEach` / `Stream.runDrain` to start a subscriber fiber;
     * interrupt the returned fiber to unsubscribe.
     */
    get changes(): Stream.Stream<CommitEvent> {
        return Stream.fromPubSub(this.pubsub);
    }
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
        case "chapter": {
            const { bookCode, chapter } = patch;
            const lexicalState =
                typeof patch.lexicalState === "function"
                    ? patch.lexicalState()
                    : patch.lexicalState;
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
                        const dirty = !tokenSourcesEqual(
                            currentTokens,
                            c.sourceTokens,
                        );
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
