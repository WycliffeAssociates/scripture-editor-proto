/**
 * Workspace-scoped layout-tick counter.
 *
 * A data-free pulse: subscribers re-measure DOM rects when the tick changes
 * but don't try to read state from the tick itself. Bumped by:
 *  - the `overlayTickPipeline` after working-files commits settle (one tick
 *    per quiet 16ms),
 *  - the workspace-level `ResizeObserver` + scroll/resize listeners,
 *  - in the future, other layout-invalidating signals (font load, etc.).
 *
 * The point is to give overlay/mutation sinks a single signal they can react
 * to, rather than each one setting up its own MutationObserver. See
 * `state-primitives-and-patterns.md` § "useLayoutTick — central layout-
 * invalidation signal".
 */
type Listener = () => void;

export class LayoutTickStore {
    #tick = 0;
    #listeners = new Set<Listener>();

    readonly subscribe = (listener: Listener): (() => void) => {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    };

    readonly getSnapshot = (): number => this.#tick;

    bump(): void {
        this.#tick += 1;
        for (const listener of this.#listeners) listener();
    }
}
