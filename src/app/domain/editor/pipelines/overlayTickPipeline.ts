import { Duration, Effect, Stream } from "effect";
import type { LayoutTickStore } from "@/app/state/LayoutTickStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

/**
 * Stream pipeline that bumps `LayoutTickStore` after working-files commits.
 *
 * Single 16ms debounce coalesces a burst of commits (typing, history replay,
 * etc.) into one tick per animation frame. The tick is data-free; subscribers
 * re-measure the editor DOM in `useLayoutEffect`.
 *
 * Workspace-level ResizeObserver/scroll listeners bump the store directly;
 * this pipeline covers the commit-driven half.
 */
export function makeOverlayTickPipeline(args: {
    workingFilesStore: WorkingFilesStore;
    layoutTickStore: LayoutTickStore;
}): Effect.Effect<void> {
    return args.workingFilesStore.changes.pipe(
        Stream.debounce(Duration.millis(16)),
        Stream.tap(() =>
            Effect.sync(() => {
                args.layoutTickStore.bump();
            }),
        ),
        Stream.runDrain,
    );
}
