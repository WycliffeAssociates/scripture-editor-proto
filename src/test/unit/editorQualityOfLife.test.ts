import { createHeadlessEditor } from "@lexical/headless";
import {
    $getRoot,
    type LexicalEditor,
    LineBreakNode,
    ParagraphNode,
} from "lexical";
import { describe, expect, it, vi } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { moveToAdjacentNodesWhenSeemsAppropriate } from "@/app/domain/editor/listeners/editorQualityOfLife.ts";
import {
    $createUSFMParagraphNode,
    USFMParagraphNode,
} from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";

function createEmptyTestEditor(): LexicalEditor {
    return createHeadlessEditor({
        nodes: [USFMParagraphNode, USFMTextNode, ParagraphNode, LineBreakNode],
    });
}

function updateAndFlush(editor: LexicalEditor, fn: () => void): Promise<void> {
    return new Promise((resolve) => {
        editor.update(fn, { discrete: true, onUpdate: resolve });
    });
}

function flush(editor: LexicalEditor): Promise<void> {
    return updateAndFlush(editor, () => {});
}

type MockKeyboardEvent = Pick<
    KeyboardEvent,
    "key" | "preventDefault" | "stopPropagation"
>;

function createSpaceEvent(): MockKeyboardEvent {
    return {
        key: " ",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
    };
}

describe("editorQualityOfLife", () => {
    it("does not inject space on protected char/end-marker boundaries", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const editor = createEmptyTestEditor();

        await updateAndFlush(editor, () => {
            const root = $getRoot();
            for (const child of root.getChildren()) child.remove();

            const paragraph = $createUSFMParagraphNode({
                id: "qol-char-para",
                marker: "p",
            });
            const endMarker = $createUSFMTextNode("\\fqa*", {
                id: "end-marker",
                tokenType: UsfmTokenTypes.endMarker,
                marker: "fqa",
            });
            const punctuation = $createUSFMTextNode(",", {
                id: "punctuation",
                tokenType: UsfmTokenTypes.text,
            });
            paragraph.append(endMarker, punctuation);
            root.append(paragraph);
            endMarker.selectEnd();
        });

        const event = createSpaceEvent();
        let handled = false;
        editor.getEditorState().read(() => {
            handled = moveToAdjacentNodesWhenSeemsAppropriate(
                editor,
                event as KeyboardEvent,
            );
        });
        await flush(editor);

        editor.getEditorState().read(() => {
            const root = $getRoot();
            const paragraph = root.getFirstChild();
            if (!paragraph) throw new Error("Missing paragraph");
            const children = paragraph.getChildren();
            const next = children[1];
            if (!$isUSFMTextNode(next)) throw new Error("Expected text node");
            expect(next.getTextContent()).toBe(",");
        });

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
        logSpy.mockRestore();
    });

    it("keeps legacy space insertion for verse marker boundaries", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const editor = createEmptyTestEditor();

        await updateAndFlush(editor, () => {
            const root = $getRoot();
            for (const child of root.getChildren()) child.remove();

            const paragraph = $createUSFMParagraphNode({
                id: "qol-verse-para",
                marker: "p",
            });
            const verseMarker = $createUSFMTextNode("\\v", {
                id: "verse-marker",
                tokenType: UsfmTokenTypes.marker,
                marker: "v",
            });
            const text = $createUSFMTextNode("Text", {
                id: "text",
                tokenType: UsfmTokenTypes.text,
            });
            paragraph.append(verseMarker, text);
            root.append(paragraph);
            verseMarker.selectEnd();
        });

        const event = createSpaceEvent();
        let handled = false;
        editor.getEditorState().read(() => {
            handled = moveToAdjacentNodesWhenSeemsAppropriate(
                editor,
                event as KeyboardEvent,
            );
        });
        await flush(editor);

        editor.getEditorState().read(() => {
            const root = $getRoot();
            const paragraph = root.getFirstChild();
            if (!paragraph) throw new Error("Missing paragraph");
            const children = paragraph.getChildren();
            const next = children[1];
            if (!$isUSFMTextNode(next)) throw new Error("Expected text node");
            expect(next.getTextContent()).toBe(" Text");
        });

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
        logSpy.mockRestore();
    });
});
