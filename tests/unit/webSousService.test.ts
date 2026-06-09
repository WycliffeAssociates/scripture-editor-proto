import { describe, expect, it } from "vitest";
import { WebSousService } from "@/web/domain/sous/WebSousService.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

// The web/wasm sous path is the browser twin of the native `sous_analyze`
// command: onion (`vrefIndexTokens`) projects each verse, sous (`analyze_vref`)
// analyzes its text, and both wasm modules run in this same JS heap. This test
// pins that the two cooperate and return the SousAnalyzeResult shape the
// pipeline commits — segment map keyed by sid, findings with UTF-16 offsets.
describe("WebSousService", () => {
    it("projects verses and returns UTF-16 findings over an anomaly", async () => {
        // Double space inside the verse → sous's deterministic
        // excess-horizontal-whitespace rule. "In the" is 6 UTF-16 units, so
        // the doubled space occupies [6, 8).
        const usfm = "\\id GEN\n\\c 1\n\\v 1 In the  beginning God created.\n";
        const { tokens } = await webUsfmOnionService.parseUsfm(usfm);

        const result = await new WebSousService().analyze(tokens);

        // Segment map carries the per-token anchors the editor resolves ranges
        // by — one entry per in-scope sid, each segment a {tokenId, textSpan}.
        expect(Object.keys(result.segments)).toContain("GEN 1:1");
        const segments = result.segments["GEN 1:1"];
        expect(segments?.length).toBeGreaterThan(0);
        expect(segments?.[0]).toMatchObject({
            tokenId: expect.any(String),
            textSpan: { start: expect.any(Number), end: expect.any(Number) },
        });

        const whitespace = result.findings.find(
            (finding) => finding.code === "lex.excess-h-whitespace",
        );
        expect(whitespace).toMatchObject({
            sid: "GEN 1:1",
            code: "lex.excess-h-whitespace",
            severity: "warning",
            start: 6,
            end: 8,
        });
        // Binary rule — no score; the JS shape omits it rather than carrying null.
        expect(whitespace?.score).toBeUndefined();
    });
});
