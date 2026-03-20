import { createHeadlessEditor } from "@lexical/headless";
import {
    $createParagraphNode,
    $getNodeByKey,
    $getRoot,
    $isElementNode,
    type LexicalEditor,
    LineBreakNode,
    ParagraphNode,
} from "lexical";
import { describe, expect, it, vi } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { settingsDefaults } from "@/app/data/settings.ts";
import {
    ensureNumberRangeAlwaysFollowsMarkerExpectingNum,
    maintainDocumentStructure,
    maintainDocumentStructureDebounced,
} from "@/app/domain/editor/listeners/maintainDocumentStructure.ts";
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

function removeAllRootChildren() {
    const root = $getRoot();
    for (const child of root.getChildren()) {
        child.remove();
    }
}

function applyMaintainDocumentStructure(
    editor: LexicalEditor,
    editorMode: "regular" | "plain",
) {
    maintainDocumentStructure(editor.getEditorState(), editor, {
        ...settingsDefaults,
        editorMode,
    });
}

function applyMaintainDocumentStructureDebounced(
    editor: LexicalEditor,
    editorMode: "regular" | "plain",
) {
    maintainDocumentStructureDebounced(editor.getEditorState(), editor, {
        ...settingsDefaults,
        editorMode,
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

describe("maintainDocumentStructure", () => {
    it("SOURCE: regular-mode paragraph enforcement does not apply (root paragraph wrapper remains)", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const editor = createEmptyTestEditor();

        await updateAndFlush(editor, () => {
            removeAllRootChildren();

            const wrapper = $createParagraphNode();
            wrapper.append(
                $createUSFMTextNode("hello", {
                    id: "t-src",
                    inPara: "p",
                    tokenType: UsfmTokenTypes.text,
                }),
            );
            $getRoot().append(wrapper);
        });

        applyMaintainDocumentStructure(editor, "plain");
        await flush(editor);

        editor.getEditorState().read(() => {
            const root = $getRoot();
            const children = root.getChildren();
            expect(children).toHaveLength(1);

            const only = children[0];
            expect($isElementNode(only)).toBe(true);
            if (!$isElementNode(only)) {
                throw new Error("Expected root child to be an element node");
            }
            expect(only.getType()).toBe("paragraph");
        });

        logSpy.mockRestore();
    });

    async function insertOrphanMarkerWithNumberRange(
        editor: LexicalEditor,
        paragraphId: string,
    ) {
        let markerKey = "";
        await updateAndFlush(editor, () => {
            removeAllRootChildren();

            const paragraph = $createUSFMParagraphNode({
                id: paragraphId,
                marker: "p",
            });

            const marker = $createUSFMTextNode("\\v", {
                id: `${paragraphId}-marker`,
                sid: "tier-b",
                tokenType: UsfmTokenTypes.marker,
            });
            marker.setMarker("v");
            markerKey = marker.getKey();

            const numberRange = $createUSFMTextNode("", {
                id: `${paragraphId}-number`,
                sid: "tier-b",
                tokenType: UsfmTokenTypes.numberRange,
            });

            paragraph.append(marker, numberRange);
            $getRoot().append(paragraph);
        });
        return markerKey;
    }

    it("Plain mode: Tier B skips orphan marker cleanup", async () => {
        const editor = createEmptyTestEditor();
        const markerKey = await insertOrphanMarkerWithNumberRange(
            editor,
            "plain-orphan-paragraph",
        );
        const updates: Array<{
            dbgLabel: string;
            run: () => void;
        }> = [];
        editor.getEditorState().read(() => {
            const markerNode = $getNodeByKey(markerKey);
            if (!markerNode || !$isUSFMTextNode(markerNode)) {
                throw new Error("Marker node missing");
            }
            ensureNumberRangeAlwaysFollowsMarkerExpectingNum({
                node: markerNode,
                tokenType: markerNode.getTokenType(),
                appSettings: {
                    ...settingsDefaults,
                    editorMode: "plain",
                },
                updates,
            });
        });
        expect(updates).toHaveLength(0);
    });

    it("Regular mode: Tier B removes orphan chapter/verse markers", async () => {
        const editor = createEmptyTestEditor();
        const markerKey = await insertOrphanMarkerWithNumberRange(
            editor,
            "regular-orphan-paragraph",
        );
        const updates: Array<{
            dbgLabel: string;
            run: () => void;
        }> = [];
        editor.getEditorState().read(() => {
            const markerNode = $getNodeByKey(markerKey);
            if (!markerNode || !$isUSFMTextNode(markerNode)) {
                throw new Error("Marker node missing");
            }
            ensureNumberRangeAlwaysFollowsMarkerExpectingNum({
                node: markerNode,
                tokenType: markerNode.getTokenType(),
                appSettings: {
                    ...settingsDefaults,
                    editorMode: "regular",
                },
                updates,
            });
        });
        expect(updates).toHaveLength(1);
        expect(updates[0].dbgLabel).toContain(
            "ensureNumberRangeAlwaysFollowsMarkerExpectingNum",
        );
    });

    it("debounced: does not add leading space after char endMarker boundary", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const editor = createEmptyTestEditor();

        await updateAndFlush(editor, () => {
            removeAllRootChildren();
            const paragraph = $createUSFMParagraphNode({
                id: "char-boundary-para",
                marker: "p",
            });
            const end = $createUSFMTextNode("\\fqa*", {
                id: "end",
                tokenType: UsfmTokenTypes.endMarker,
                marker: "fqa",
            });
            const punctuation = $createUSFMTextNode(",", {
                id: "punct",
                tokenType: UsfmTokenTypes.text,
            });
            paragraph.append(end, punctuation);
            $getRoot().append(paragraph);
        });

        applyMaintainDocumentStructureDebounced(editor, "regular");
        await flush(editor);

        editor.getEditorState().read(() => {
            const root = $getRoot();
            const para = root.getFirstChild();
            if (!para || !$isElementNode(para)) {
                throw new Error("Expected paragraph node");
            }
            const children = para.getChildren();
            const end = children[0];
            const punctuation = children[1];
            if (!$isUSFMTextNode(end) || !$isUSFMTextNode(punctuation)) {
                throw new Error("Expected USFM text children");
            }
            expect(end.getTextContent()).toBe("\\fqa*");
            expect(punctuation.getTextContent()).toBe(",");
        });

        logSpy.mockRestore();
    });

    it("debounced: does not invent spacing at verse marker boundaries", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const editor = createEmptyTestEditor();

        await updateAndFlush(editor, () => {
            removeAllRootChildren();
            const paragraph = $createUSFMParagraphNode({
                id: "verse-spacing-para",
                marker: "p",
            });
            const verseMarker = $createUSFMTextNode("\\v", {
                id: "v-marker",
                tokenType: UsfmTokenTypes.marker,
                marker: "v",
            });
            const text = $createUSFMTextNode("Text", {
                id: "text",
                tokenType: UsfmTokenTypes.text,
            });
            paragraph.append(verseMarker, text);
            $getRoot().append(paragraph);
        });

        applyMaintainDocumentStructureDebounced(editor, "regular");
        await flush(editor);

        editor.getEditorState().read(() => {
            const root = $getRoot();
            const para = root.getFirstChild();
            if (!para || !$isElementNode(para)) {
                throw new Error("Expected paragraph node");
            }
            const children = para.getChildren();
            const text = children[1];
            if (!$isUSFMTextNode(text)) {
                throw new Error("Expected USFM text node");
            }
            expect(text.getTextContent()).toBe("Text");
        });

        logSpy.mockRestore();
    });
});
