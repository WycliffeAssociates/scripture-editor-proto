import { Cause, Duration, Effect, Exit, Schedule } from "effect";

const computeDefaultConcurrency = (): number => {
    const cores =
        typeof navigator !== "undefined"
            ? navigator.hardwareConcurrency
            : undefined;
    if (!cores || cores < 2) return 2;
    return Math.max(2, Math.floor(cores / 2));
};

const DEFAULT_CONCURRENCY = computeDefaultConcurrency();

export interface BoundedConcurrentOptions {
    concurrency?: number;
    retry?: {
        attempts: number;
        backoffMs?: number;
    };
}

/**
 * Runs `fn` over `items` with a bounded number of concurrent in-flight calls.
 * Defaults to half of `navigator.hardwareConcurrency` (min 2) so we leave room
 * for the rest of the user's machine. Rejects on the first failure; partial
 * results are discarded.
 */
export async function boundedConcurrent<T, A>(
    items: readonly T[],
    fn: (item: T, index: number) => Promise<A>,
    options?: BoundedConcurrentOptions,
): Promise<A[]> {
    if (items.length === 0) return [];

    const concurrency = Math.max(
        1,
        options?.concurrency ?? DEFAULT_CONCURRENCY,
    );
    const retryAttempts = Math.max(1, options?.retry?.attempts ?? 1);
    const backoffMs = options?.retry?.backoffMs ?? 100;

    const runOne = (item: T, index: number) => {
        const work = Effect.tryPromise({
            try: () => fn(item, index),
            catch: (cause) => cause,
        });
        if (retryAttempts <= 1) return work;
        return work.pipe(
            Effect.retry(
                Schedule.exponential(Duration.millis(backoffMs)).pipe(
                    Schedule.both(Schedule.recurs(retryAttempts - 1)),
                ),
            ),
        );
    };

    const exit = await Effect.runPromiseExit(
        Effect.forEach(items, runOne, { concurrency }),
    );

    if (Exit.isSuccess(exit)) {
        return exit.value;
    }
    throw Cause.squash(exit.cause);
}
