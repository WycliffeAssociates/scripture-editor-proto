// @vitest-environment jsdom
//
// bridgePlugin.test.tsx
//
// Integration test for `WorkingFilesBridgePlugin`. Mounts the real
// component inside a `LexicalComposer` + a partial `WorkspaceContext`
// value, then drives `editor.update(...)` with the tag combinations
// the bridge classifies on and asserts on the published
// `CommitEvent`s.
//
// Per plan v2: assert on *filtered event classes*, not exact counts.
// Lexical's update lifecycle can emit phantom updates (mount-time
// init, focus blur, etc.); we discard whatever events the listener
// sees during mount and then filter `dirtyTextContent === true`
// before counting content-changing events.
//
// **Coverage gap intentionally accepted:** the selectionOnly /
// `metadataOnly` publish branch (when `dirtyElements.size === 0 &&
// dirtyLeaves.size === 0`) is not exercised here. Lexical optimizes
// out updates with no state change, and the natural producer of
// selection-only updates — user cursor movement / focus shifts —
// requires real-DOM selection plumbing that jsdom does not provide
// faithfully. The branch itself is a four-line `if (!dirty)` block;
// a regression would manifest as "no metadataOnly events reaching
// overlay-tick filtering," which is observable in `editor.spec.ts`
// (manual cursor navigation against real DOM).

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { Deferred, Effect, Fiber, Stream } from "effect";
import {
    $createParagraphNode,
    $getRoot,
    HISTORIC_TAG,
    HISTORY_MERGE_TAG,
    LineBreakNode,
    ParagraphNode,
    TextNode,
    type LexicalEditor,
} from "lexical";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import { BookFrontmatterFormNode } from "@/app/domain/editor/nodes/BookFrontmatterFormNode.tsx";
import { USFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { WorkingFilesBridgePlugin } from "@/app/domain/editor/plugins/WorkingFilesBridgePlugin.tsx";
import {
    WorkspaceContext,
    type WorkSpaceContextType,
} from "@/app/ui/contexts/WorkspaceContext.tsx";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import { makeBook } from "@tests/helpers/workspaceFixtures.ts";

// We provide only the WorkspaceContext fields the bridge actually
// uses (`workingFilesStore`, `project`, `mainEditorDeferred`); the
// rest of the 30+ field interface stays `undefined`. Cast through
// `unknown` and document the choice rather than fabricate stubs for
// every collaborator — that's exactly the "test the mock harness"
// anti-pattern the audit flagged.
function makeWorkspaceContextValue(args: {
    workingFilesStore: WorkingFilesStore;
    mainEditorDeferred: Deferred.Deferred<LexicalEditor>;
}): WorkSpaceContextType {
    return {
        workingFilesStore: args.workingFilesStore,
        mainEditorDeferred: args.mainEditorDeferred,
        project: {
            pickedFile: { bookCode: "GEN" },
            pickedChapter: { chapterNumber: 1 },
            currentChapter: 1,
        },
    } as unknown as WorkSpaceContextType;
}

const INITIAL_CONFIG = {
    namespace: "test",
    nodes: [
        USFMParagraphNode,
        USFMTextNode,
        {
            replace: TextNode,
            with: (node: TextNode) =>
                $createUSFMTextNode(node.getTextContent(), {
                    id: guidGenerator(),
                    sid: "",
                    inPara: "",
                }),
            withKlass: USFMTextNode,
        },
        ParagraphNode,
        LineBreakNode,
        BookFrontmatterFormNode,
        USFMNestedEditorNode,
    ],
    onError: (err: Error) => {
        throw err;
    },
};

beforeAll(() => {
    const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    g.IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let collectorFiber: Fiber.Fiber<void, unknown> | null = null;

afterEach(async () => {
    if (collectorFiber) {
        await Effect.runPromise(Fiber.interrupt(collectorFiber));
        collectorFiber = null;
    }
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
});

type Mounted = {
    editor: LexicalEditor;
    wf: WorkingFilesStore;
    events: CommitEvent[];
};

async function mount(): Promise<Mounted> {
    const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
    const mainEditorDeferred = Effect.runSync(Deferred.make<LexicalEditor>());
    const ctxValue = makeWorkspaceContextValue({
        workingFilesStore: wf,
        mainEditorDeferred,
    });

    // Subscribe to commits *before* mount so we never miss an event.
    const events: CommitEvent[] = [];
    collectorFiber = Effect.runFork(
        wf.changes.pipe(
            Stream.tap((event) =>
                Effect.sync(() => {
                    events.push(event);
                }),
            ),
            Stream.runDrain,
        ),
    );
    // Let the subscriber register before we mount the bridge.
    await new Promise<void>((r) => setImmediate(r));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root?.render(
            <WorkspaceContext.Provider value={ctxValue}>
                <LexicalComposer initialConfig={INITIAL_CONFIG}>
                    <WorkingFilesBridgePlugin />
                </LexicalComposer>
            </WorkspaceContext.Provider>,
        );
    });

    // Bridge resolves the deferred on mount; await it for the editor handle.
    const editor = await Effect.runPromise(Deferred.await(mainEditorDeferred));
    return { editor, wf, events };
}

const contentChanging = (events: CommitEvent[]) =>
    events.filter((e) => e.meta.dirtyTextContent === true);

/**
 * Append a paragraph containing one USFM text node to the editor's
 * root. The act of appending dirties `dirtyElements` (root +
 * paragraph) and `dirtyLeaves` (text), so the bridge's `if (!dirty)`
 * branch is skipped and a chapter-kind commit publishes.
 */
async function appendParagraph(
    editor: LexicalEditor,
    text: string,
    options: { tag?: string | string[] } = {},
): Promise<void> {
    await act(async () => {
        editor.update(
            () => {
                const para = $createParagraphNode();
                para.append(
                    $createUSFMTextNode(text, {
                        id: `t-${text}`,
                        sid: "GEN 1:1",
                        inPara: "",
                    }),
                );
                $getRoot().append(para);
            },
            // Cast through unknown — Lexical's update-options tag accepts
            // string or string-array depending on version; the runtime
            // honors both.
            options.tag ? ({ tag: options.tag } as unknown as Parameters<
                LexicalEditor["update"]
            >[1]) : undefined,
        );
        // Flush the update lifecycle through the pubsub + collector.
        await new Promise<void>((res) => setImmediate(res));
    });
}

describe("WorkingFilesBridgePlugin (integration)", () => {
    it("a user edit produces at least one content-changing userEdit commit", async () => {
        const { editor, events } = await mount();
        events.length = 0;

        await appendParagraph(editor, "hello");

        const content = contentChanging(events);
        expect(content.length).toBeGreaterThanOrEqual(1);
        expect(content[0].meta.kind).toBe("userEdit");
        expect(content[0].meta.dirtyTextContent).toBe(true);
        expect(content[0].patch.kind).toBe("chapter");
    });

    it("programaticIgnore-tagged updates produce zero content-changing events", async () => {
        const { editor, events } = await mount();
        events.length = 0;

        await appendParagraph(editor, "ignored", {
            tag: EDITOR_TAGS_USED.programaticIgnore,
        });

        expect(contentChanging(events)).toHaveLength(0);
    });

    it("HISTORY_MERGE_TAG without structural-fix is skipped", async () => {
        const { editor, events } = await mount();
        events.length = 0;

        await appendParagraph(editor, "merged", { tag: HISTORY_MERGE_TAG });

        expect(contentChanging(events)).toHaveLength(0);
    });

    it("classifies as structuralFixup when programmaticStructuralFix is tagged alongside HISTORY_MERGE_TAG", async () => {
        // Fixup writebacks set both tags: the structural-fix tag so the
        // commit still publishes (classified as `structuralFixup`), and
        // the history-merge tag so it stays out of undo.
        const { editor, events } = await mount();
        events.length = 0;

        await appendParagraph(editor, "fix", {
            tag: [HISTORY_MERGE_TAG, EDITOR_TAGS_USED.programmaticStructuralFix],
        });

        const content = contentChanging(events);
        expect(content.length).toBeGreaterThanOrEqual(1);
        expect(content[0].meta.kind).toBe("structuralFixup");
    });

    it("HISTORIC_TAG classifies edits as undo", async () => {
        const { editor, events } = await mount();
        events.length = 0;

        await appendParagraph(editor, "undone", { tag: HISTORIC_TAG });

        const content = contentChanging(events);
        expect(content.length).toBeGreaterThanOrEqual(1);
        expect(content[0].meta.kind).toBe("undo");
    });
});
