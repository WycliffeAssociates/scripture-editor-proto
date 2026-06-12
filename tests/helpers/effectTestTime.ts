// effectTestTime.ts
//
// Shared Effect-test utilities for store-seam integration tests in
// `tests/unit/integration/`. Promoted from `lintPipeline.test.ts` once a
// second test (`overlayTickPipeline.test.ts`) needed the same wait
// pattern — rule of three counts the third use as the trigger; this
// hits it.
//
// **Why yields matter.** `WorkingFilesStore.commit` publishes via
// `Effect.runFork(PubSub.publish(...))` on the *default* Effect
// runtime, while pipeline subscribers are forked into the
// test-runtime fiber. The PubSub queue is shared memory, so events
// land synchronously, but the subscriber fiber on the test runtime
// needs cooperative yields between (a) the fork and the first
// publish (so it subscribes before the publish), (b) each batch of
// sync `wf.commit(...)` calls and `TestClock.adjust` (so it dequeues
// and registers a debounce sleep with the test clock), and (c) after
// `TestClock.adjust` (so the inner switchMap/mapEffect steps run
// before assertions). One yield is not enough — the pipeline has
// several Stream operators between pubsub-receive and
// sleep-registration. Five empirically suffices.

import { Duration, Effect } from "effect";
import { TestClock } from "effect/testing";

/**
 * Default cooperative-yield budget. Five is enough to step a typical
 * pipeline (`fromPubSub` → `filter` → `debounce`'s sleep registration)
 * from one phase to the next. Bump locally only if a specific test
 * hits a phase boundary not covered by this default.
 */
const DRAIN_YIELDS = 5;

/** Yield `n` times to let other fibers on this runtime make progress. */
export const drainYields = (n: number = DRAIN_YIELDS) =>
  Effect.gen(function* () {
    for (let i = 0; i < n; i++) yield* Effect.yieldNow;
  });

/**
 * Bridge sync `wf.commit(...)` calls to `TestClock.adjust`. Yields,
 * advances the test clock by `ms`, then yields again. Use after sync
 * commits when the pipeline you're testing has a `Stream.debounce` or
 * other time-dependent operator.
 */
export const passTime = (ms: number) =>
  Effect.gen(function* () {
    yield* drainYields();
    yield* TestClock.adjust(Duration.millis(ms));
    yield* drainYields();
  });
