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
});
