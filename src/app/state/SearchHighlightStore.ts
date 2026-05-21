/**
 * Workspace-scoped store of the currently-painted search matches.
 *
 * The legacy code path called `highlightMatches` imperatively at every place
 * matches changed; that meant the painted highlights could drift from the
 * editor DOM whenever something else (structure pipeline, chapter swap) moved
 * nodes around between search interactions. With the store, `HighlightSink`
 * subscribes to both the store and `useLayoutTick` and repaints in
 * `useLayoutEffect` — so highlights stay in lockstep with the live DOM.
 *
 * Shape mirrors `EditorHighlightInput[]` from `useSearchHighlighter` so the
 * paint function can be called directly. `null` means "no highlights".
 */
import type { LexicalEditor } from "lexical";
import type { MatchInNode } from "@/app/ui/hooks/useSearchHighlighter.ts";

export type SearchHighlightInput = {
    editor: LexicalEditor;
    matches: MatchInNode[];
    activeMatch?: MatchInNode;
};

type Listener = () => void;

export class SearchHighlightStore {
    #state: SearchHighlightInput[] | null = null;
    #listeners = new Set<Listener>();

    readonly subscribe = (listener: Listener): (() => void) => {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    };

    readonly getSnapshot = (): SearchHighlightInput[] | null => this.#state;

    set(inputs: SearchHighlightInput[] | null): void {
        this.#state = inputs;
        for (const listener of this.#listeners) listener();
    }

    clear(): void {
        this.set(null);
    }
}
