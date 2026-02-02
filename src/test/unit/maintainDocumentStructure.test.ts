import { createHeadlessEditor } from "@lexical/headless";
import {
    $createParagraphNode,
    $getNodeByKey,
    $getRoot,
    $isElementNode,
    ElementNode,
    type LexicalEditor,
    LineBreakNode,
    ParagraphNode,
    type SerializedElementNode,
    type Spread,
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
    $isUSFMParagraphNode,
    USFMParagraphNode,
} from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";

type SerializedTestBlockNode = Spread<
    {
        type: "test-block";
        version: 1;
    },
    SerializedElementNode
>;

class TestBlockNode extends ElementNode {
    static getType(): string {
        return "test-block";
    }

    static clone(node: TestBlockNode): TestBlockNode {
        return new TestBlockNode(node.__key);
    }

    createDOM(): HTMLElement {
        // Headless tests should never call into DOM creation.
        return {} as unknown as HTMLElement;
    }

    updateDOM(): boolean {
        return false;
    }

    exportJSON(): SerializedTestBlockNode {
        return {
            ...super.exportJSON(),
            type: "test-block",
            version: 1,
        };
    }

    static importJSON(_serializedNode: SerializedTestBlockNode): TestBlockNode {
        return new TestBlockNode();
    }
}

function $createTestBlockNode(): TestBlockNode {
    return new TestBlockNode();
}

function createEmptyTestEditor(): LexicalEditor {
    return createHeadlessEditor({
        nodes: [
            USFMParagraphNode,
            USFMTextNode,
            ParagraphNode,
            LineBreakNode,
            TestBlockNode,
        ],
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

describe("maintainDocumentStructure: enforceRegularModeParagraphStructure", () => {
    it("WYSIWYG: converts each built-in paragraph wrapper into a single USFMParagraphNode root child (no merge)", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const editor = createEmptyTestEditor();

        let wrapperTextKey1 = "";
        let wrapperTextKey2 = "";

        await updateAndFlush(editor, () => {
            removeAllRootChildren();

            const wrapper1 = $createParagraphNode();
            const t1 = $createUSFMTextNode("first", {
                id: "t1",
                inPara: "p",
                tokenType: UsfmTokenTypes.text,
            });
            wrapperTextKey1 = t1.getKey();
            wrapper1.append(t1);

            const wrapper2 = $createParagraphNode();
            const t2 = $createUSFMTextNode("second", {
                id: "t2",
                inPara: "p",
                tokenType: UsfmTokenTypes.text,
            });
            wrapperTextKey2 = t2.getKey();
            wrapper2.append(t2);

            $getRoot().append(wrapper1, wrapper2);
        });

        applyMaintainDocumentStructure(editor, "regular");
        await flush(editor);

        editor.getEditorState().read(() => {
            const root = $getRoot();
            const children = root.getChildren();

            expect(children).toHaveLength(2);
            expect(children.every($isUSFMParagraphNode)).toBe(true);

            const para1 = children[0];
            const para2 = children[1];
            if (!$isUSFMParagraphNode(para1) || !$isUSFMParagraphNode(para2)) {
                throw new Error(
                    "Expected root children to be USFMParagraphNode",
                );
            }

            const para1ChildKeys = para1.getChildren().map((c) => c.getKey());
            const para2ChildKeys = para2.getChildren().map((c) => c.getKey());

            expect(para1ChildKeys).toContain(wrapperTextKey1);
            expect(para2ChildKeys).toContain(wrapperTextKey2);
            expect(para1ChildKeys).not.toContain(wrapperTextKey2);
            expect(para2ChildKeys).not.toContain(wrapperTextKey1);
        });

        logSpy.mockRestore();
    });

    it("WYSIWYG: non-paragraph root element is not unwrapped; it is moved under a new USFMParagraphNode", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const editor = createEmptyTestEditor();

        let nonParagraphRootKey = "";

        await updateAndFlush(editor, () => {
            removeAllRootChildren();

            const wrapper1 = $createParagraphNode();
            wrapper1.append(
                $createUSFMTextNode("before", {
                    id: "t-before",
                    inPara: "p",
                    tokenType: UsfmTokenTypes.text,
                }),
            );

            const nonParagraphRoot = $createTestBlockNode();
            nonParagraphRootKey = nonParagraphRoot.getKey();

            const wrapper2 = $createParagraphNode();
            wrapper2.append(
                $createUSFMTextNode("after", {
                    id: "t-after",
                    inPara: "p",
                    tokenType: UsfmTokenTypes.text,
                }),
            );

            $getRoot().append(wrapper1, nonParagraphRoot, wrapper2);
        });

        applyMaintainDocumentStructure(editor, "regular");
        await flush(editor);

        editor.getEditorState().read(() => {
            const root = $getRoot();
            const children = root.getChildren();

            expect(children).toHaveLength(3);
            expect(children.every($isUSFMParagraphNode)).toBe(true);

            const middle = children[1];
            if (!$isUSFMParagraphNode(middle)) {
                throw new Error(
                    "Expected middle child to be a USFMParagraphNode",
                );
            }

            expect(middle.getChildrenSize()).toBe(1);
            const wrapped = middle.getFirstChild();
            expect(wrapped?.getKey()).toBe(nonParagraphRootKey);
            expect(wrapped?.getType()).toBe("test-block");
        });

        logSpy.mockRestore();
    });

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
