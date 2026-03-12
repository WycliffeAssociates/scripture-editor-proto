import { describe, expect, it } from "vitest";
import type { UsjDocument } from "@/core/domain/usfm/usfmOnionTypes.ts";
import { usjToParsedUsfmDocument } from "@/core/domain/usfm/usjToParsedUsfm.ts";

describe("usjToParsedUsfmDocument", () => {
    it("reconstructs note opener spacing when markerText is absent", () => {
        const document: UsjDocument = {
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
                        "Example",
                        {
                            type: "note",
                            marker: "f",
                            caller: "+",
                            content: [
                                {
                                    type: "char",
                                    marker: "ft",
                                    content: ["Footnote text"],
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const parsed = usjToParsedUsfmDocument(document);
        const chapter = parsed.chapters[6];
        expect(chapter).toBeDefined();
        if (!chapter) return;

        const noteMarker = chapter.find((token) => token.marker === "f");
        expect(noteMarker?.text).toBe("\\f ");
        expect(noteMarker?.content?.[0]?.text).toBe("+");
    });
});
