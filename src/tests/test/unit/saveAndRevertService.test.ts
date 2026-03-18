import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { buildBooksSavePayload } from "@/app/domain/project/saveAndRevertService.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

function makeTokens(text: string, sid: string, id: string): Token[] {
    return [
        {
            id,
            kind: "text",
            span: { start: 0, end: text.length },
            sid,
            text,
        },
    ];
}

function makeEditorState(text: string, sid: string, id: string) {
    return {
        root: {
            type: "root" as const,
            version: 1,
            direction: "ltr" as const,
            format: "start" as const,
            indent: 0,
            children: [
                {
                    type: "paragraph",
                    version: 1,
                    direction: "ltr" as const,
                    format: "" as const,
                    indent: 0,
                    textFormat: 0,
                    textStyle: "",
                    children: [
                        createSerializedUSFMTextNode({
                            text,
                            sid,
                            id,
                            tokenType: UsfmTokenTypes.text,
                        }),
                    ],
                },
            ],
        },
    };
}

describe("buildBooksSavePayload", () => {
    it("saves full book content when any chapter in that book is dirty", () => {
        const files: ParsedFile[] = [
            {
                path: "/tmp/MRK.usfm",
                title: "Mark",
                bookCode: "MRK",
                nextBookId: null,
                prevBookId: null,
                chapters: [
                    {
                        chapNumber: 1,
                        dirty: false,
                        sourceTokens: makeTokens(
                            "\\c 1\n\\p\nChapter one.\n",
                            "MRK 1:1",
                            "m1-loaded",
                        ),
                        currentTokens: makeTokens(
                            "\\c 1\n\\p\nChapter one.\n",
                            "MRK 1:1",
                            "m1-current",
                        ),
                        loadedLexicalState: makeEditorState(
                            "\\c 1\n\\p\nChapter one.\n",
                            "MRK 1:1",
                            "m1",
                        ),
                        lexicalState: makeEditorState(
                            "\\c 1\n\\p\nChapter one.\n",
                            "MRK 1:1",
                            "m1",
                        ),
                    },
                    {
                        chapNumber: 15,
                        dirty: true,
                        sourceTokens: makeTokens(
                            "\\c 15\n\\p\nOld text.\n",
                            "MRK 15:1",
                            "m15-loaded",
                        ),
                        currentTokens: makeTokens(
                            "\\c 15\n\\p\nNew text.\n",
                            "MRK 15:1",
                            "m15-current",
                        ),
                        loadedLexicalState: makeEditorState(
                            "\\c 15\n\\p\nOld text.\n",
                            "MRK 15:1",
                            "m15",
                        ),
                        lexicalState: makeEditorState(
                            "\\c 15\n\\p\nNew text.\n",
                            "MRK 15:1",
                            "m15",
                        ),
                    },
                ],
            },
        ];

        const payload = buildBooksSavePayload(files);

        expect(payload.MRK).toBe(
            "\\c 1\n\\p\nChapter one.\n\\c 15\n\\p\nNew text.\n",
        );
    });
});
