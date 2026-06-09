// historySelection.test.ts
//
// Pins the selection capture/restore mechanics the undo/redo layer rides:
//
//   1. `$captureCurrentSelection` element-point mapping — post-Enter / IME
//      selections sit on ELEMENT nodes; capture maps them to the nearest
//      text position instead of returning null (a null capture costs
//      cursor fidelity downstream: undo falls back to weaker data).
//   2. `$restoreSelectionNearId` — when a replay deleted the node the
//      cursor sat on, the caret lands on the nearest SURVIVING neighbor in
//      document order (ordered by the snapshot of the tree being left),
//      never silently at chapter start.
//   3. `orderedTextIdsFromSnapshot` — structural identification of text
//      nodes (`text` + `id`), paragraph ids excluded.
//
// Headless Lexical, no DOM. Selection state is created and asserted inside
// a single `editor.update`.

import { createHeadlessEditor } from "@lexical/headless";
import {
    $createRangeSelection,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $setSelection,
    LineBreakNode,
    ParagraphNode,
    TextNode,
} from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    $createUSFMParagraphNode,
    USFMParagraphNode,
} from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type { CanonicalChapterSnapshot } from "@/app/domain/history/canonicalChapterState.ts";
import {
    $captureCurrentSelection,
    $restoreSelectionById,
    $restoreSelectionNearId,
    orderedTextIdsFromSnapshot,
    typingRunContiguous,
} from "@/app/domain/history/historySelection.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";

function createTestEditor() {
    return createHeadlessEditor({
        nodes: [
            USFMParagraphNode,
            USFMTextNode,
            {
                replace: TextNode,
                with: (node: TextNode) =>
                    $createUSFMTextNode(node.getTextContent(), {
                        id: "replace-text",
                        sid: "",
                        inPara: "",
                    }),
                withKlass: USFMTextNode,
            },
            ParagraphNode,
            LineBreakNode,
        ],
    });
}

function $makeText(id: string, text: string) {
    return $createUSFMTextNode(text, {
        id,
        tokenType: UsfmTokenTypes.text,
        sid: "GEN 1:1",
        inPara: "p",
    });
}

/** Build `<para> t1:"In the" t2:" beginning" </para>` and return the nodes. */
function $seedTwoTextNodes() {
    const root = $getRoot();
    for (const child of root.getChildren()) child.remove();
    const para = $createUSFMParagraphNode({
        id: "p1",
        marker: "p",
        tokenType: UsfmTokenTypes.marker,
    });
    const t1 = $makeText("t1", "In the");
    const t2 = $makeText("t2", " beginning");
    para.append(t1, t2);
    root.append(para);
    return { para, t1, t2 };
}

function runUpdate(editor: ReturnType<typeof createTestEditor>, fn: () => void) {
    return new Promise<void>((resolve) => {
        editor.update(fn, { discrete: true, onUpdate: resolve });
    });
}

describe("$captureCurrentSelection", () => {
    it("captures a text-point selection by data-id", async () => {
        const editor = createTestEditor();
        await runUpdate(editor, () => {
            const { t1, t2 } = $seedTwoTextNodes();
            const sel = $createRangeSelection();
            sel.anchor.set(t1.getKey(), 2, "text");
            sel.focus.set(t2.getKey(), 5, "text");
            $setSelection(sel);

            expect($captureCurrentSelection()).toEqual({
                anchorId: "t1",
                anchorOffset: 2,
                focusId: "t2",
                focusOffset: 5,
            });
        });
    });

    it("maps an element-point selection to the end of the preceding text", async () => {
        const editor = createTestEditor();
        await runUpdate(editor, () => {
            const { para } = $seedTwoTextNodes();
            // Element point between children 0 and 1 — the shape a
            // post-Enter or IME selection takes.
            const sel = $createRangeSelection();
            sel.anchor.set(para.getKey(), 1, "element");
            sel.focus.set(para.getKey(), 1, "element");
            $setSelection(sel);

            expect($captureCurrentSelection()).toEqual({
                anchorId: "t1",
                anchorOffset: "In the".length,
                focusId: "t1",
                focusOffset: "In the".length,
            });
        });
    });

    it("maps an element point at offset 0 to the start of the following text", async () => {
        const editor = createTestEditor();
        await runUpdate(editor, () => {
            const { para } = $seedTwoTextNodes();
            const sel = $createRangeSelection();
            sel.anchor.set(para.getKey(), 0, "element");
            sel.focus.set(para.getKey(), 0, "element");
            $setSelection(sel);

            expect($captureCurrentSelection()).toEqual({
                anchorId: "t1",
                anchorOffset: 0,
                focusId: "t1",
                focusOffset: 0,
            });
        });
    });

    it("returns null when there is no selection", async () => {
        const editor = createTestEditor();
        await runUpdate(editor, () => {
            $seedTwoTextNodes();
            $setSelection(null);
            expect($captureCurrentSelection()).toBeNull();
        });
    });
});

describe("orderedTextIdsFromSnapshot", () => {
    it("collects text-node ids in document order, skipping non-text ids", () => {
        const snapshot: CanonicalChapterSnapshot = {
            direction: LanguageDirection.LTR,
            flatNodes: [
                { type: "usfm-text", version: 1, text: "\\v", id: "m1" },
                { type: "usfm-text", version: 1, text: " 1", id: "n1" },
                // Paragraph-ish entry: has an id but no text — excluded.
                { type: "usfm-paragraph", version: 1, id: "p1" },
                { type: "usfm-text", version: 1, text: "In the", id: "t1" },
            ] as unknown as CanonicalChapterSnapshot["flatNodes"],
        };
        expect(orderedTextIdsFromSnapshot(snapshot)).toEqual([
            "m1",
            "n1",
            "t1",
        ]);
    });
});

describe("typingRunContiguous", () => {
    const at = (id: string, offset: number) => ({
        anchorId: id,
        anchorOffset: offset,
        focusId: id,
        focusOffset: offset,
    });

    it("continues the run when the cursor sits where the last edit left it", () => {
        expect(
            typingRunContiguous(at("t1", 3), at("t1", 3), at("t1", 4)),
        ).toBe(true);
    });

    it("seals the run on any repositioning", () => {
        expect(
            typingRunContiguous(at("t1", 3), at("t1", 1), at("t1", 2)),
        ).toBe(false);
        expect(
            typingRunContiguous(at("t1", 3), at("t2", 3), at("t2", 4)),
        ).toBe(false);
    });

    it("seals the run when the edit landed outside the run's node (stale before-cursor)", () => {
        // selectionchange lag: the before-cursor still matches the run's
        // end, but the keystroke actually landed in another node.
        expect(
            typingRunContiguous(at("t1", 3), at("t1", 3), at("t2", 1)),
        ).toBe(false);
    });

    it("seals when the run is selectionless but the keystroke knows its position", () => {
        // Load-time fixup write-backs record selectionless entries; user
        // typing must not merge into one (it would lose selectionBefore).
        expect(typingRunContiguous(null, at("t1", 3), at("t1", 4))).toBe(
            false,
        );
    });

    it("defers to the time window when there is no selection signal at all", () => {
        expect(typingRunContiguous(at("t1", 3), null, null)).toBe(true);
        expect(typingRunContiguous(undefined, undefined, undefined)).toBe(
            true,
        );
    });

    it("judges by the edit site alone when only the before-cursor is unreadable", () => {
        expect(typingRunContiguous(at("t1", 3), null, at("t1", 4))).toBe(true);
        expect(typingRunContiguous(at("t1", 3), null, at("t2", 1))).toBe(
            false,
        );
    });
});

describe("$restoreSelectionNearId", () => {
    // The leaving tree had t1, t2, t3, t4; the replayed tree dropped t3.
    const orderedIds = ["t1", "t2", "t3", "t4"];

    it("places the caret at the END of the closest preceding survivor", async () => {
        const editor = createTestEditor();
        await runUpdate(editor, () => {
            const root = $getRoot();
            for (const child of root.getChildren()) child.remove();
            const para = $createUSFMParagraphNode({
                id: "p1",
                marker: "p",
                tokenType: UsfmTokenTypes.marker,
            });
            para.append($makeText("t1", "one"), $makeText("t2", "two"), $makeText("t4", "four"));
            root.append(para);

            // Primary restore fails (t3 is gone) — the precondition.
            expect(
                $restoreSelectionById({
                    anchorId: "t3",
                    anchorOffset: 1,
                    focusId: "t3",
                    focusOffset: 1,
                }),
            ).toBe(false);

            expect($restoreSelectionNearId("t3", orderedIds)).toBe(true);
            const sel = $getSelection();
            if (!$isRangeSelection(sel)) throw new Error("expected range");
            const anchorNode = sel.anchor.getNode();
            expect(
                anchorNode instanceof USFMTextNode && anchorNode.getId(),
            ).toBe("t2");
            expect(sel.anchor.offset).toBe("two".length);
            expect(sel.isCollapsed()).toBe(true);
        });
    });

    it("falls forward to the closest following survivor when nothing precedes", async () => {
        const editor = createTestEditor();
        await runUpdate(editor, () => {
            const root = $getRoot();
            for (const child of root.getChildren()) child.remove();
            const para = $createUSFMParagraphNode({
                id: "p1",
                marker: "p",
                tokenType: UsfmTokenTypes.marker,
            });
            // Only t4 survives.
            para.append($makeText("t4", "four"));
            root.append(para);

            expect($restoreSelectionNearId("t3", orderedIds)).toBe(true);
            const sel = $getSelection();
            if (!$isRangeSelection(sel)) throw new Error("expected range");
            const anchorNode = sel.anchor.getNode();
            expect(
                anchorNode instanceof USFMTextNode && anchorNode.getId(),
            ).toBe("t4");
            expect(sel.anchor.offset).toBe(0);
        });
    });

    it("returns false when the dead id is not in the reference ordering", async () => {
        const editor = createTestEditor();
        await runUpdate(editor, () => {
            $seedTwoTextNodes();
            expect($restoreSelectionNearId("unknown", orderedIds)).toBe(false);
        });
    });

    it("returns false when no neighbor survives", async () => {
        const editor = createTestEditor();
        await runUpdate(editor, () => {
            const root = $getRoot();
            for (const child of root.getChildren()) child.remove();
            expect($restoreSelectionNearId("t3", orderedIds)).toBe(false);
        });
    });
});
