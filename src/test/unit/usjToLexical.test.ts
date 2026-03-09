import { describe, expect, it } from "vitest";
import { editorTreeToLexicalStatesByChapter } from "@/app/domain/editor/serialization/usjToLexical.ts";
import { lexicalEditorStateToOnionFlatTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { EditorTreeDocument } from "@/core/domain/usfm/usfmOnionTypes.ts";

describe("usjToLexical marker separator fidelity", () => {
    it("uses markerText from editor tree for book/chapter/verse markers", () => {
        const tree: EditorTreeDocument = {
            type: "USJ",
            version: "3.1",
            content: [
                {
                    type: "book",
                    marker: "id",
                    markerText: "\\id ",
                    code: "GEN",
                    content: [],
                },
                {
                    type: "chapter",
                    marker: "c",
                    markerText: "\\c ",
                    number: "1",
                },
                {
                    type: "para",
                    marker: "p",
                    content: [
                        {
                            type: "verse",
                            marker: "v",
                            markerText: "\\v ",
                            number: "1",
                            sid: "GEN 1:1",
                        },
                        "In the beginning.",
                    ],
                },
            ],
        };

        const byChapter = editorTreeToLexicalStatesByChapter({
            tree,
            direction: "ltr",
            needsParagraphs: false,
        });
        const chapterZero = byChapter[0];
        const chapterOne = byChapter[1];
        expect(chapterZero).toBeDefined();
        expect(chapterOne).toBeDefined();
        if (!chapterZero || !chapterOne) return;

        const chapterZeroTokens = lexicalEditorStateToOnionFlatTokens(
            chapterZero.lexicalState,
        );
        const chapterOneTokens = lexicalEditorStateToOnionFlatTokens(
            chapterOne.lexicalState,
        );

        expect(chapterZeroTokens[0]?.text).toBe("\\id ");
        expect(chapterZeroTokens[1]?.text).toBe("GEN");
        expect(
            chapterOneTokens.find((token) => token.marker === "c")?.text,
        ).toBe("\\c ");
        expect(
            chapterOneTokens.find((token) => token.marker === "v")?.text,
        ).toBe("\\v ");
    });

    it("does not synthesize separator spaces when markerText is absent", () => {
        const tree: EditorTreeDocument = {
            type: "USJ",
            version: "3.1",
            content: [
                {
                    type: "book",
                    marker: "id",
                    code: "GEN",
                    content: [],
                },
            ],
        };

        const byChapter = editorTreeToLexicalStatesByChapter({
            tree,
            direction: "ltr",
            needsParagraphs: false,
        });
        const chapterZero = byChapter[0];
        expect(chapterZero).toBeDefined();
        if (!chapterZero) return;

        const tokens = lexicalEditorStateToOnionFlatTokens(
            chapterZero.lexicalState,
        );
        expect(tokens[0]?.text).toBe("\\id");
        expect(tokens[1]?.text).toBe("GEN");
    });
});
