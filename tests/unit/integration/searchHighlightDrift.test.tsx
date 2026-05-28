// @vitest-environment jsdom
//
// searchHighlightDrift.test.tsx
//
// Drift guard for the `SearchHighlightStore` + `LayoutTickStore` +
// `HighlightSink` triangle (plan user story 13). The contract under
// test:
//
//   Set search matches via `SearchHighlightStore.set(...)` →
//   `HighlightSink` paints them.
//   Later, when something nudges layout (commit settle, scroll,
//   resize) and `LayoutTickStore.bump()` fires →
//   `HighlightSink` *repaints* using the current store state, not a
//   stale snapshot.
//
// Painting itself reaches into the CSS Custom Highlight Registry,
// which jsdom only stubs. We don't assert on rendered highlights;
// we mock the paint module at the boundary
// (`useSearchHighlighter.ts`) and assert that the right paint
// function is called the right number of times with the right
// state.
//
// The visible regression (highlights drift after typing) is
// observed at the e2e tier (`editor.spec.ts` Search Functionality
// suite, especially "re-runs search on reopen and chapter
// navigation for highlight sync"). This file pins the
// `useLayoutEffect([state, tick])` invariant that *makes* the e2e
// pass.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HighlightSink } from "@/app/domain/editor/plugins/HighlightSink.tsx";
import { LayoutTickStore } from "@/app/state/LayoutTickStore.ts";
import { SearchHighlightStore } from "@/app/state/SearchHighlightStore.ts";
import type { SearchHighlightInput } from "@/app/state/SearchHighlightStore.ts";
import { WorkspaceContext } from "@/app/ui/contexts/_workspaceContext.ts";
import type { WorkSpaceContextType } from "@/app/ui/contexts/WorkspaceContext.tsx";

const highlightMatchesAcrossEditorsMock = vi.hoisted(() => vi.fn());
const clearHighlightsMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/ui/hooks/useSearchHighlighter.ts", () => ({
    highlightMatchesAcrossEditors: highlightMatchesAcrossEditorsMock,
    clearHighlights: clearHighlightsMock,
}));

function makeWorkspaceContextValue(args: {
    searchHighlightStore: SearchHighlightStore;
    layoutTickStore: LayoutTickStore;
}): WorkSpaceContextType {
    return {
        searchHighlightStore: args.searchHighlightStore,
        layoutTickStore: args.layoutTickStore,
    } as unknown as WorkSpaceContextType;
}

/**
 * Minimal `SearchHighlightInput`: the store accepts any
 * `LexicalEditor` shape since paint is mocked. Cast through
 * `unknown` so we don't drag in a headless editor just to make the
 * types align — the paint side is the boundary.
 */
function fakeMatches(label: string): SearchHighlightInput[] {
    return [
        {
            editor: { __label: label } as unknown as SearchHighlightInput["editor"],
            matches: [
                {
                    label,
                } as unknown as SearchHighlightInput["matches"][number],
            ],
        },
    ];
}

beforeAll(() => {
    const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    g.IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
    if (root) {
        act(() => {
            root?.unmount();
        });
        root = null;
    }
    if (container) {
        container.remove();
        container = null;
    }
    highlightMatchesAcrossEditorsMock.mockReset();
    clearHighlightsMock.mockReset();
});

function mount(ctx: WorkSpaceContextType) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root?.render(
            <WorkspaceContext.Provider value={ctx}>
                <HighlightSink />
            </WorkspaceContext.Provider>,
        );
    });
}

describe("HighlightSink (drift guard)", () => {
    it("paints when SearchHighlightStore.set fires", () => {
        const searchHighlightStore = new SearchHighlightStore();
        const layoutTickStore = new LayoutTickStore();
        mount(
            makeWorkspaceContextValue({ searchHighlightStore, layoutTickStore }),
        );

        // Mount runs the layout effect once with null state → clear.
        expect(clearHighlightsMock).toHaveBeenCalledTimes(1);
        expect(highlightMatchesAcrossEditorsMock).not.toHaveBeenCalled();

        const matches = fakeMatches("first");
        act(() => {
            searchHighlightStore.set(matches);
        });

        expect(highlightMatchesAcrossEditorsMock).toHaveBeenCalledTimes(1);
        expect(highlightMatchesAcrossEditorsMock).toHaveBeenLastCalledWith(
            matches,
        );
    });

    it("repaints on LayoutTickStore.bump using the current store state (no drift)", () => {
        const searchHighlightStore = new SearchHighlightStore();
        const layoutTickStore = new LayoutTickStore();
        mount(
            makeWorkspaceContextValue({ searchHighlightStore, layoutTickStore }),
        );

        const matches = fakeMatches("set-then-bump");
        act(() => {
            searchHighlightStore.set(matches);
        });
        expect(highlightMatchesAcrossEditorsMock).toHaveBeenCalledTimes(1);

        // A layout-tick bump (typing-settle, scroll, resize) must
        // trigger a fresh paint with the *same* current matches.
        act(() => {
            layoutTickStore.bump();
        });

        expect(highlightMatchesAcrossEditorsMock).toHaveBeenCalledTimes(2);
        expect(highlightMatchesAcrossEditorsMock).toHaveBeenLastCalledWith(
            matches,
        );
    });

    it("clears when store transitions to null and ignores subsequent bumps as long as state stays null", () => {
        const searchHighlightStore = new SearchHighlightStore();
        const layoutTickStore = new LayoutTickStore();
        mount(
            makeWorkspaceContextValue({ searchHighlightStore, layoutTickStore }),
        );

        act(() => {
            searchHighlightStore.set(fakeMatches("temp"));
        });
        // Reset both counters now that the "set up a state to clear"
        // step is done; from here we only care about
        // transition-to-null + subsequent bump behavior.
        clearHighlightsMock.mockClear();
        highlightMatchesAcrossEditorsMock.mockClear();

        act(() => {
            searchHighlightStore.clear();
        });
        expect(clearHighlightsMock).toHaveBeenCalledTimes(1);

        // A tick bump while state is null re-runs the effect; it
        // takes the null branch and clears again. Clearing twice is
        // idempotent and matches the docstring's statement that the
        // sink "runs every tick."
        act(() => {
            layoutTickStore.bump();
        });
        expect(clearHighlightsMock).toHaveBeenCalledTimes(2);
        expect(highlightMatchesAcrossEditorsMock).not.toHaveBeenCalled();
    });

    it("paints with the latest matches when set fires twice in a row", () => {
        const searchHighlightStore = new SearchHighlightStore();
        const layoutTickStore = new LayoutTickStore();
        mount(
            makeWorkspaceContextValue({ searchHighlightStore, layoutTickStore }),
        );

        const firstMatches = fakeMatches("first");
        const secondMatches = fakeMatches("second");
        act(() => {
            searchHighlightStore.set(firstMatches);
        });
        act(() => {
            searchHighlightStore.set(secondMatches);
        });

        expect(highlightMatchesAcrossEditorsMock).toHaveBeenCalledTimes(2);
        expect(highlightMatchesAcrossEditorsMock).toHaveBeenLastCalledWith(
            secondMatches,
        );
    });
});
