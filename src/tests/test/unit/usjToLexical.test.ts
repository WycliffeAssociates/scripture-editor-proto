import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { USFM_NESTED_DECORATOR_TYPE } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { editorTreeToLexicalStatesByChapter } from "@/app/domain/editor/serialization/usjToLexical.ts";
import {
    lexicalEditorStateToOnionFlatTokens,
    lexicalEditorStateToOnionLintFlatTokens,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { DocumentTreeDocument } from "@/core/domain/usfm/usfmOnionTypes.ts";

function collectNodeTypes(nodes: SerializedLexicalNode[]): string[] {
    const out: string[] = [];

    for (const node of nodes) {
        out.push(node.type);
        if ("children" in node && Array.isArray(node.children)) {
            out.push(
                ...collectNodeTypes(node.children as SerializedLexicalNode[]),
            );
        }
        if (
            "editorState" in node &&
            node.editorState &&
            typeof node.editorState === "object" &&
            "root" in node.editorState &&
            node.editorState.root &&
            typeof node.editorState.root === "object" &&
            Array.isArray(
                (
                    node.editorState.root as {
                        children?: SerializedLexicalNode[];
                    }
                ).children,
            )
        ) {
            out.push(
                ...collectNodeTypes(
                    (
                        node.editorState.root as {
                            children: SerializedLexicalNode[];
                        }
                    ).children,
                ),
            );
        }
    }

    return out;
}

describe("usjToLexical marker separator fidelity", () => {
    it("uses markerText from editor tree for book/chapter/verse markers", () => {
        const tree: DocumentTreeDocument = {
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
                        {
                            type: "text",
                            value: "In the beginning.",
                        },
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
        const tree: DocumentTreeDocument = {
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

    it("restores a structural linebreak after synthetic paragraph markers for lint projection", () => {
        const tree: DocumentTreeDocument = {
            type: "USJ",
            version: "3.1",
            content: [
                {
                    type: "book",
                    marker: "id",
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
                        {
                            type: "text",
                            value: "In the beginning.",
                        },
                    ],
                },
            ],
        };

        const byChapter = editorTreeToLexicalStatesByChapter({
            tree,
            direction: "ltr",
            needsParagraphs: true,
        });
        const chapterOne = byChapter[1];
        expect(chapterOne).toBeDefined();
        if (!chapterOne) return;

        const normalProjection = lexicalEditorStateToOnionFlatTokens(
            chapterOne.lexicalState,
        )
            .map((token) => token.text)
            .join("");
        const lintProjection = lexicalEditorStateToOnionLintFlatTokens(
            chapterOne.lexicalState,
        )
            .map((token) => token.text)
            .join("");

        expect(normalProjection).toContain("\\p\\v 1In the beginning.");
        expect(lintProjection).toContain("\\p\n\\v 1In the beginning.");
    });

    it("does not add a linebreak when paragraph markerText already carries same-line spacing", () => {
        const tree: DocumentTreeDocument = {
            type: "USJ",
            version: "3.1",
            content: [
                {
                    type: "book",
                    marker: "id",
                    code: "GEN",
                    content: [],
                },
                {
                    type: "chapter",
                    marker: "c",
                    number: "1",
                },
                {
                    type: "para",
                    marker: "q1",
                    markerText: "\\q1 ",
                    content: [
                        {
                            type: "text",
                            value: "Poetry line",
                        },
                    ],
                },
            ],
        };

        const byChapter = editorTreeToLexicalStatesByChapter({
            tree,
            direction: "ltr",
            needsParagraphs: true,
        });
        const chapterOne = byChapter[1];
        expect(chapterOne).toBeDefined();
        if (!chapterOne) return;

        const lintProjection = lexicalEditorStateToOnionLintFlatTokens(
            chapterOne.lexicalState,
        )
            .map((token) => token.text)
            .join("");

        expect(lintProjection).toContain("\\q1 Poetry line");
        expect(lintProjection).not.toContain("\\q1\n");
    });

    it("does not duplicate space after closeMarkerText when following text already starts with space", () => {
        const tree: DocumentTreeDocument = {
            type: "USJ",
            version: "3.1",
            content: [
                {
                    type: "book",
                    marker: "id",
                    code: "GEN",
                    content: [],
                },
                {
                    type: "chapter",
                    marker: "c",
                    number: "1",
                },
                {
                    type: "para",
                    marker: "p",
                    content: [
                        {
                            type: "note",
                            marker: "f",
                            caller: "+",
                            content: [
                                {
                                    type: "char",
                                    marker: "fqa",
                                    markerText: "\\fqa ",
                                    closeMarkerText: "\\fqa*",
                                    closeSuffix: " ",
                                    closed: true,
                                    content: [
                                        {
                                            type: "text",
                                            value: "A voice cries out in the wilderness",
                                        },
                                    ],
                                },
                                {
                                    type: "text",
                                    value: " which follows Matthew 3:3.",
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const byChapter = editorTreeToLexicalStatesByChapter({
            tree,
            direction: "ltr",
            needsParagraphs: false,
        });
        const chapterOne = byChapter[1];
        expect(chapterOne).toBeDefined();
        if (!chapterOne) return;

        const tokens = lexicalEditorStateToOnionFlatTokens(
            chapterOne.lexicalState,
        );
        const serialized = tokens.map((token) => token.text).join("");
        expect(serialized).toContain(
            "\\fqa A voice cries out in the wilderness\\fqa* which follows Matthew 3:3.",
        );
        expect(serialized).not.toContain("\\fqa*  which");
    });

    it("reconstructs note opener spacing when note markerText is absent", () => {
        const tree: DocumentTreeDocument = {
            type: "USJ",
            version: "3.1",
            content: [
                {
                    type: "book",
                    marker: "id",
                    code: "MRK",
                    content: [],
                },
                {
                    type: "chapter",
                    marker: "c",
                    number: "6",
                },
                {
                    type: "para",
                    marker: "p",
                    content: [
                        {
                            type: "verse",
                            marker: "v",
                            number: "3",
                            sid: "MRK 6:3",
                        },
                        {
                            type: "note",
                            marker: "f",
                            caller: "+",
                            content: [
                                {
                                    type: "char",
                                    marker: "ft",
                                    content: [
                                        {
                                            type: "text",
                                            value: "Footnote text",
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const byChapter = editorTreeToLexicalStatesByChapter({
            tree,
            direction: "ltr",
            needsParagraphs: false,
        });
        const chapter = byChapter[6];
        expect(chapter).toBeDefined();
        if (!chapter) return;

        const serialized = lexicalEditorStateToOnionFlatTokens(
            chapter.lexicalState,
        )
            .map((token) => token.text)
            .join("");

        expect(serialized).toContain("\\f +");
        expect(serialized).not.toContain("\\f+");
    });

    it("flattens notes in plain/usfm modes instead of emitting nested editor nodes", () => {
        const tree: DocumentTreeDocument = {
            type: "USJ",
            version: "3.1",
            content: [
                {
                    type: "book",
                    marker: "id",
                    code: "MRK",
                    content: [],
                },
                {
                    type: "chapter",
                    marker: "c",
                    number: "15",
                },
                {
                    type: "para",
                    marker: "p",
                    content: [
                        {
                            type: "verse",
                            marker: "v",
                            markerText: "\\v ",
                            number: "28",
                            sid: "MRK 15:28",
                        },
                        {
                            type: "note",
                            marker: "f",
                            markerText: "\\f ",
                            caller: "+",
                            closed: false,
                            content: [
                                {
                                    type: "char",
                                    marker: "ft",
                                    markerText: "\\ft ",
                                    closeMarkerText: "\\ft*",
                                    closed: true,
                                    content: [
                                        {
                                            type: "text",
                                            value: "The best ancient copies do not have Mark 15:28.",
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            type: "para",
                            marker: "p",
                            content: [
                                {
                                    type: "verse",
                                    marker: "v",
                                    markerText: "\\v ",
                                    number: "29",
                                    sid: "MRK 15:29",
                                },
                                {
                                    type: "text",
                                    value: "Those who passed by insulted him.",
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const byChapter = editorTreeToLexicalStatesByChapter({
            tree,
            direction: "ltr",
            needsParagraphs: false,
        });
        const chapter = byChapter[15];
        expect(chapter).toBeDefined();
        if (!chapter) return;

        expect(
            collectNodeTypes(
                chapter.lexicalState.root.children as SerializedLexicalNode[],
            ),
        ).not.toContain(USFM_NESTED_DECORATOR_TYPE);

        const serialized = lexicalEditorStateToOnionFlatTokens(
            chapter.lexicalState,
        )
            .map((token) => token.text)
            .join("");

        expect(serialized).toContain("\\v 28");
        expect(serialized).toContain(
            "\\f + \\ft The best ancient copies do not have Mark 15:28.\\ft*",
        );
        expect(serialized).toContain("\\v 29Those who passed by insulted him.");
    });

    it("keeps notes nested in regular mode", () => {
        const tree: DocumentTreeDocument = {
            type: "USJ",
            version: "3.1",
            content: [
                {
                    type: "book",
                    marker: "id",
                    code: "MRK",
                    content: [],
                },
                {
                    type: "chapter",
                    marker: "c",
                    number: "15",
                },
                {
                    type: "para",
                    marker: "p",
                    content: [
                        {
                            type: "verse",
                            marker: "v",
                            markerText: "\\v ",
                            number: "28",
                            sid: "MRK 15:28",
                        },
                        {
                            type: "note",
                            marker: "f",
                            markerText: "\\f ",
                            caller: "+",
                            closed: true,
                            content: [
                                {
                                    type: "text",
                                    value: "Footnote",
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const byChapter = editorTreeToLexicalStatesByChapter({
            tree,
            direction: "ltr",
            needsParagraphs: true,
        });
        const chapter = byChapter[15];
        expect(chapter).toBeDefined();
        if (!chapter) return;

        expect(
            collectNodeTypes(
                chapter.lexicalState.root.children as SerializedLexicalNode[],
            ),
        ).toContain(USFM_NESTED_DECORATOR_TYPE);
    });
});
