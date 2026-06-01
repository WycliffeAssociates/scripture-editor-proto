// biome-ignore-all lint/correctness/useExhaustiveDependencies: this helper
// forwards the caller's dependency array to useEffect by design — the caller
// owns the fiber-restart triggers (same contract as the inline useEffect it
// replaces). Biome can't statically verify a forwarded (non-literal) deps list.

import { Effect, Fiber } from "effect";
import { type DependencyList, useEffect } from "react";

/**
 * Fork an Effect pipeline as a workspace-scoped fiber and interrupt it on
 * cleanup. Codifies the "the workspace owns this reactive pipeline" wiring that
 * WorkspaceContext repeats per pipeline (lint, save-status, overlay-tick,
 * dirty-buffer, recovered-conflict, structure-maintenance).
 *
 * `make` is re-invoked (and the prior fiber interrupted + a new one forked)
 * whenever `deps` change — pass the same dependency array you would have given
 * the inline `useEffect`. These are workspace-scoped *effects*; they live next
 * to the kernel for lifecycle, but the kernel doesn't need to hand-roll the
 * fork/interrupt dance for each one.
 */
export function useForkedPipeline(
    make: () => Effect.Effect<unknown, unknown, never>,
    deps: DependencyList,
): void {
    useEffect(() => {
        const fiber = Effect.runFork(make());
        return () => {
            Effect.runFork(Fiber.interrupt(fiber));
        };
    }, deps);
}
