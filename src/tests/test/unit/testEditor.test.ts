import { describe, expect, it } from "vitest";
import {
    createTestEditor,
    getEditorTextContent,
} from "@/test/helpers/testEditor.ts";

describe("testEditor helpers", () => {
    it("should create an editor from USFM content", async () => {
        const usfmContent = `\\id GEN
\\c 1
\\p
\\v 1 In the beginning God created the heaven and the earth.`;

        const editor = await createTestEditor(usfmContent);

        // Verify editor was created
        expect(editor).toBeDefined();

        // Verify we can get text content
        const textContent = getEditorTextContent(editor);
        expect(textContent).toContain("In the beginning");
    });

    it("should extract text content from editor", async () => {
        const usfmContent = `\\id GEN
\\c 1
\\p
\\v 1 Test verse content.`;

        const editor = await createTestEditor(usfmContent);
        const textContent = getEditorTextContent(editor);

        expect(textContent).toContain("Test verse content");
    });

    it("should handle multiple verses", async () => {
        const usfmContent = `\\id GEN
\\c 1
\\p
\\v 1 First verse.
\\v 2 Second verse.
\\v 3 Third verse.`;

        const editor = await createTestEditor(usfmContent);
        const textContent = getEditorTextContent(editor);

        expect(textContent).toContain("First verse");
        expect(textContent).toContain("Second verse");
        expect(textContent).toContain("Third verse");
    });
});
