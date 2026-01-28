import { $getRoot, $getSelection, $isRangeSelection } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { jumpCursorForNextParagraphingMarker } from "@/app/domain/editor/utils/paragraphingNavigation.ts";
import { createTestEditor } from "@/test/helpers/testEditor.ts";

function collectAllUsfmTextNodes(): USFMTextNode[] {
    const root = $getRoot();
    const out: USFMTextNode[] = [];
    for (const child of root.getChildren()) {
        if (!$isUSFMTextNode(child) && "getChildren" in child) {
            // Paragraph nodes, etc
            // biome-ignore lint/suspicious/noExplicitAny: Lexical node typing is structural here
            (child as any).getChildren?.().forEach((n: unknown) => {
                if ($isUSFMTextNode(n as any)) out.push(n as USFMTextNode);
            });
            continue;
        }
        if ($isUSFMTextNode(child)) out.push(child);
    }
    return out;
}

describe("paragraphingNavigation", () => {
    it("jumps to the verse marker for the next SID (block start)", async () => {
        const editor = createTestEditor(`\\id GEN
\\c 1
\\p
\\v 1 Verse one.
\\p
\\v 2 Verse two.`);

        editor.update(() => {
            const nodes = collectAllUsfmTextNodes();
            const firstText = nodes.find(
                (n) => n.getTokenType() === UsfmTokenTypes.text,
            );
            expect(firstText).toBeDefined();
            firstText?.select(0, 0);

            jumpCursorForNextParagraphingMarker({ type: "p", sid: "GEN 1:2" });
        });

        await new Promise((r) => setTimeout(r, 0));

        editor.getEditorState().read(() => {
            const sel = $getSelection();
            expect(sel && $isRangeSelection(sel)).toBe(true);
            if (!sel || !$isRangeSelection(sel)) return;

            const node = sel.anchor.getNode();
            expect($isUSFMTextNode(node)).toBe(true);
            if (!$isUSFMTextNode(node)) return;

            expect(node.getTokenType()).toBe(UsfmTokenTypes.marker);
            expect(node.getMarker()).toBe("v");
            expect(node.getSid()).toBe("GEN 1:2");
        });
    });

    it("for q2+, prefers jumping forward to punctuation within the current SID", async () => {
        const editor = createTestEditor(`\\id GEN
\\c 1
\\p
\\v 1 Foo; bar baz.`);

        let textNodeContent = "";
        editor.update(() => {
            const nodes = collectAllUsfmTextNodes();
            const firstText = nodes.find(
                (n) => n.getTokenType() === UsfmTokenTypes.text,
            );
            expect(firstText).toBeDefined();
            if (!firstText) return;
            textNodeContent = firstText.getTextContent();
            firstText.select(0, 0);

            // Provide a sid (so verse-marker jump would be possible), but q2 should avoid it.
            jumpCursorForNextParagraphingMarker({
                type: "q2",
                sid: "GEN 1:1",
                contextText: "Foo;",
            });
        });

        await new Promise((r) => setTimeout(r, 0));

        editor.getEditorState().read(() => {
            const sel = $getSelection();
            expect(sel && $isRangeSelection(sel)).toBe(true);
            if (!sel || !$isRangeSelection(sel)) return;

            const node = sel.anchor.getNode();
            expect($isUSFMTextNode(node)).toBe(true);
            if (!$isUSFMTextNode(node)) return;

            // Should land in text, not on the verse marker.
            expect(node.getTokenType()).toBe(UsfmTokenTypes.text);

            const semiIndex = textNodeContent.indexOf(";");
            expect(semiIndex).toBeGreaterThanOrEqual(0);

            // Cursor should land after "; " (start of "bar")
            expect(sel.anchor.offset).toBe(semiIndex + 2);
        });
    });
});
