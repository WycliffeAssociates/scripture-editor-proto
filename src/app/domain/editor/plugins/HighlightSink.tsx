import { useLayoutEffect, useSyncExternalStore } from "react";
import { useLayoutTick } from "@/app/ui/hooks/useLayoutTick.ts";
import {
    clearHighlights,
    highlightMatchesAcrossEditors,
} from "@/app/ui/hooks/useSearchHighlighter.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

/**
 * Repaints search highlights from `SearchHighlightStore` whenever the
 * workspace layout tick fires (commit settle, scroll, resize) or the store
 * updates. The store is the only call site that decides what to paint;
 * search hooks publish to it via `searchHighlightStore.set(...)` instead of
 * calling the imperative `highlightMatches` helpers.
 *
 * Active-match scroll is intentionally NOT here — the sink runs every tick
 * and `scrollIntoView` would fight the user's own scroll. Call sites
 * trigger scroll explicitly via `scrollToActiveMatchInEditor`.
 */
export function HighlightSink() {
    const { searchHighlightStore, layoutTickStore } = useWorkspaceContext();
    const state = useSyncExternalStore(
        searchHighlightStore.subscribe,
        searchHighlightStore.getSnapshot,
    );
    const tick = useLayoutTick(layoutTickStore);
    // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the intentional trigger.
    useLayoutEffect(() => {
        if (!state || state.length === 0) {
            clearHighlights();
            return;
        }
        highlightMatchesAcrossEditors(state);
    }, [state, tick]);
    return null;
}
