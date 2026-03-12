import { describe, expect, it } from "vitest";
import { createTestEditor } from "@/test/helpers/testEditor.ts";

describe("Lexical root wrapping", () => {
    it("should parse serialized state in usfm/plain modes (wrapped root)", async () => {
        await expect(
            createTestEditor("\\id GEN\n\\c 1\n\\v 1 In the beginning", {
                needsParagraphs: false,
            }),
        ).resolves.toBeDefined();
    });
});
