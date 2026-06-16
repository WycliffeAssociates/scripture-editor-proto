import { Duration, Effect, Ref, Stream } from "effect";

import type { ConsumerBookScope } from "@/app/state/commitFilters.ts";
import type { CommitEvent } from "@/app/state/types.ts";

/** The union of scopes accumulated since the last successful pass. */
export type FoldedBookScope = {
  all: boolean;
  books: ReadonlySet<string>;
};

const EMPTY_FOLD: FoldedBookScope = { all: false, books: new Set() };

function foldInto(
  acc: FoldedBookScope,
  scope: ConsumerBookScope,
): FoldedBookScope {
  if (scope === "all") return { all: true, books: acc.books };
  if (scope.size === 0) return acc;
  const books = new Set(acc.books);
  for (const book of scope) {
    books.add(book);
  }
  return { all: acc.all, books };
}

function foldUnion(a: FoldedBookScope, b: FoldedBookScope): FoldedBookScope {
  const books = new Set(a.books);
  for (const book of b.books) {
    books.add(book);
  }
  return { all: a.all || b.all, books };
}

/**
 * Debounced commit subscriber that FOLDS event scopes instead of keeping
 * only the latest event.
 *
 * `Stream.debounce` emits the last element of a burst and discards the
 * earlier ones — fine for a trigger, wrong for scope-carrying events: a
 * commit touching book A followed within the window by one touching book B
 * would silently drop A from the reaction. So scopes accumulate into a `Ref`
 * as events arrive, the debounce only paces the TRIGGER, and each pass
 * drains the accumulated union.
 *
 * Cancel-safety: a pass takes ownership of the accumulated scope
 * (`getAndSet` to empty) and, if interrupted by `switchMap` because a newer
 * trigger fired, restores what it took — so the next pass covers
 * old ∪ new and no book's reaction is ever lost. The accumulator is cleared
 * only by a pass that runs to completion.
 *
 * `run` receives the folded scope and should read the LATEST store state
 * (folded events span multiple snapshots; only a fresh read is coherent).
 * Errors must be handled inside `run` — an uncaught defect kills the
 * pipeline fiber.
 */
export function makeFoldedScopePipeline(args: {
  changes: Stream.Stream<CommitEvent>;
  scopeFor: (event: CommitEvent) => ConsumerBookScope;
  debounceMs: number;
  run: (scope: FoldedBookScope) => Effect.Effect<void>;
}): Effect.Effect<void> {
  return Effect.gen(function* () {
    const acc = yield* Ref.make<FoldedBookScope>(EMPTY_FOLD);
    yield* args.changes.pipe(
      Stream.map(args.scopeFor),
      Stream.filter((scope) => scope === "all" || scope.size > 0),
      Stream.mapEffect((scope) =>
        Ref.update(acc, (current) => foldInto(current, scope)),
      ),
      Stream.debounce(Duration.millis(args.debounceMs)),
      Stream.switchMap(() =>
        Stream.fromEffect(
          Effect.gen(function* () {
            const taken = yield* Ref.getAndSet(acc, EMPTY_FOLD);
            if (!taken.all && taken.books.size === 0) return;
            yield* args
              .run(taken)
              .pipe(
                Effect.onInterrupt(() =>
                  Ref.update(acc, (current) => foldUnion(current, taken)),
                ),
              );
          }),
        ),
      ),
      Stream.runDrain,
    );
  });
}
