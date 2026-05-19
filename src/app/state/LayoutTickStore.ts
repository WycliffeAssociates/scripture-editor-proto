/**
 * Workspace-scoped layout-tick counter. A data-free pulse: subscribers
 * re-measure DOM rects when the tick changes. Bumped by the
 * `overlayTickPipeline` (one tick per quiet 16ms after commits) plus
 * workspace-level `ResizeObserver` + scroll/resize listeners. Centralizing
 * the signal here avoids every overlay setting up its own MutationObserver.
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
