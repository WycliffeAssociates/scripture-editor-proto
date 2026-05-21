import { useSyncExternalStore } from "react";
import type { LayoutTickStore } from "@/app/state/LayoutTickStore.ts";

/**
 * Subscribe to the workspace-scoped layout tick. The returned number changes
 * (monotonic) whenever something layout-relevant happened; consumers use it
 * as a `useLayoutEffect` dependency rather than reading data from it.
 */
export function useLayoutTick(store: LayoutTickStore): number {
    return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
