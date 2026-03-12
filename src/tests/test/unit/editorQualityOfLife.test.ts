import { createHeadlessEditor } from "@lexical/headless";
import {
    $getRoot,
    $isElementNode,
    type LexicalEditor,
    LineBreakNode,
    ParagraphNode,
} from "lexical";
import { describe, expect, it, vi } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    handleBackspaceToRemoveLinebreakBeforeVerse,
    moveToAdjacentNodesWhenSeemsAppropriate,
} from "@/app/domain/editor/listeners/editorQualityOfLife.ts";
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

function createBackspaceEvent(): MockKeyboardEvent {
    return {
        key: "Backspace",
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
            if (!paragraph || !$isElementNode(paragraph))
                throw new Error("Missing paragraph");
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
            if (!paragraph || !$isElementNode(paragraph))
                throw new Error("Missing paragraph");
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

    it("backspace at the numberRange boundary before the visible verse number removes the preceding linebreak", async () => {
        const editor = createEmptyTestEditor();

        await updateAndFlush(editor, () => {
            const root = $getRoot();
            for (const child of root.getChildren()) child.remove();

            const paragraph = $createUSFMParagraphNode({
                id: "qol-verse-backspace-para",
                marker: "p",
            });
            const lineBreak = new LineBreakNode();
            const verseMarker = $createUSFMTextNode("\\v", {
                id: "verse-marker",
                tokenType: UsfmTokenTypes.marker,
                marker: "v",
            });
            const verseNumber = $createUSFMTextNode(" 2", {
                id: "verse-number",
                tokenType: UsfmTokenTypes.numberRange,
                marker: "v",
            });
            const text = $createUSFMTextNode(" Era ka", {
                id: "verse-text",
                tokenType: UsfmTokenTypes.text,
            });
            paragraph.append(lineBreak, verseMarker, verseNumber, text);
            root.append(paragraph);
            verseNumber.select(1, 1);
        });

        const event = createBackspaceEvent();
        let handled = false;
        editor.getEditorState().read(() => {
            handled = handleBackspaceToRemoveLinebreakBeforeVerse(
                editor,
                event as KeyboardEvent,
            );
        });
        await flush(editor);

        editor.getEditorState().read(() => {
            const root = $getRoot();
            const paragraph = root.getFirstChild();
            if (!paragraph || !$isElementNode(paragraph))
                throw new Error("Missing paragraph");
            const children = paragraph.getChildren();
            expect(children).toHaveLength(3);
            expect(children[0].getType()).not.toBe("linebreak");
            const verseMarker = children[0];
            const verseNumber = children[1];
            if (
                !$isUSFMTextNode(verseMarker) ||
                !$isUSFMTextNode(verseNumber)
            ) {
                throw new Error("Expected verse marker and number nodes");
            }
            expect(verseMarker.getTextContent()).toBe("\\v");
            expect(verseNumber.getTextContent()).toBe(" 2");
        });

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
    });

    it("backspace at the hidden verse marker boundary removes the preceding linebreak", async () => {
        const editor = createEmptyTestEditor();

        await updateAndFlush(editor, () => {
            const root = $getRoot();
            for (const child of root.getChildren()) child.remove();

            const paragraph = $createUSFMParagraphNode({
                id: "qol-hidden-verse-marker-backspace-para",
                marker: "p",
            });
            const lineBreak = new LineBreakNode();
            const verseMarker = $createUSFMTextNode("\\v ", {
                id: "verse-marker-hidden",
                tokenType: UsfmTokenTypes.marker,
                marker: "v",
            });
            const verseNumber = $createUSFMTextNode("2", {
                id: "verse-number-hidden",
                tokenType: UsfmTokenTypes.numberRange,
                marker: "v",
            });
            paragraph.append(
                lineBreak,
                verseMarker,
                verseNumber,
                $createUSFMTextNode(" Era ka", {
                    id: "verse-text-hidden",
                    tokenType: UsfmTokenTypes.text,
                }),
            );
            root.append(paragraph);
            verseMarker.selectEnd();
        });

        const event = createBackspaceEvent();
        let handled = false;
        editor.getEditorState().read(() => {
            handled = handleBackspaceToRemoveLinebreakBeforeVerse(
                editor,
                event as KeyboardEvent,
            );
        });
        await flush(editor);

        editor.getEditorState().read(() => {
            const root = $getRoot();
            const paragraph = root.getFirstChild();
            if (!paragraph || !$isElementNode(paragraph))
                throw new Error("Missing paragraph");
            const children = paragraph.getChildren();
            expect(children).toHaveLength(3);
            expect(children[0].getType()).not.toBe("linebreak");
            const verseMarker = children[0];
            const verseNumber = children[1];
            if (
                !$isUSFMTextNode(verseMarker) ||
                !$isUSFMTextNode(verseNumber)
            ) {
                throw new Error("Expected verse marker and number nodes");
            }
            expect(verseMarker.getTextContent()).toBe("\\v ");
            expect(verseNumber.getTextContent()).toBe("2");
        });

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
    });

    it("backspace at a verse boundary removes an explicit paragraphing marker break", async () => {
        const editor = createEmptyTestEditor();

        await updateAndFlush(editor, () => {
            const root = $getRoot();
            for (const child of root.getChildren()) child.remove();

            const firstParagraph = $createUSFMParagraphNode({
                id: "qol-para-merge-prev",
                marker: "p",
            });
            firstParagraph.append(
                $createUSFMTextNode("\\v", {
                    id: "verse-marker-5",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                }),
                $createUSFMTextNode(" 5", {
                    id: "verse-number-5",
                    tokenType: UsfmTokenTypes.numberRange,
                    marker: "v",
                }),
                $createUSFMTextNode(" Ko ira a Farisi", {
                    id: "verse-text-5",
                    tokenType: UsfmTokenTypes.text,
                }),
                new LineBreakNode(),
            );

            const secondParagraph = $createUSFMParagraphNode({
                id: "qol-para-merge-next",
                marker: "q1",
            });
            const verseMarker = $createUSFMTextNode("\\v", {
                id: "verse-marker-6",
                tokenType: UsfmTokenTypes.marker,
                marker: "v",
            });
            const verseNumber = $createUSFMTextNode(" 6", {
                id: "verse-number-6",
                tokenType: UsfmTokenTypes.numberRange,
                marker: "v",
            });
            secondParagraph.append(
                verseMarker,
                verseNumber,
                $createUSFMTextNode(' A sa kaya vei ira ko Jisu, "', {
                    id: "verse-text-6",
                    tokenType: UsfmTokenTypes.text,
                }),
                new LineBreakNode(),
            );

            root.append(firstParagraph, secondParagraph);
            verseNumber.select(1, 1);
        });

        const event = createBackspaceEvent();
        let handled = false;
        editor.getEditorState().read(() => {
            handled = handleBackspaceToRemoveLinebreakBeforeVerse(
                editor,
                event as KeyboardEvent,
            );
        });
        await flush(editor);

        editor.getEditorState().read(() => {
            const root = $getRoot();
            const paragraphs = root.getChildren();
            expect(paragraphs).toHaveLength(1);

            const onlyParagraph = paragraphs[0];
            if (!onlyParagraph || !$isElementNode(onlyParagraph)) {
                throw new Error("Expected merged paragraph");
            }

            const children = onlyParagraph.getChildren();
            const verseMarkers = children.filter(
                (child) =>
                    $isUSFMTextNode(child) &&
                    child.getTokenType() === UsfmTokenTypes.marker &&
                    child.getMarker() === "v",
            );
            expect(verseMarkers).toHaveLength(2);
            const paragraphMarkers = children.filter(
                (child) =>
                    $isUSFMTextNode(child) &&
                    child.getTokenType() === UsfmTokenTypes.marker &&
                    child.getMarker() === "q1",
            );
            expect(paragraphMarkers).toHaveLength(0);

            const verse6Number = children.find(
                (child) =>
                    $isUSFMTextNode(child) && child.getTextContent() === " 6",
            );
            if (!$isUSFMTextNode(verse6Number)) {
                throw new Error("Expected verse 6 number node");
            }
            expect(verse6Number.getTokenType()).toBe(
                UsfmTokenTypes.numberRange,
            );
        });

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
    });
});
