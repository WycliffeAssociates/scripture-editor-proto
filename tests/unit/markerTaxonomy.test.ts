import { beforeAll, describe, expect, it } from "vitest";
import {
    classifyParagraphMarker,
    isSectionMarker,
} from "@/app/domain/editor/markerTaxonomy.ts";
import { initializeUsfmMarkerCatalog } from "@/core/domain/usfm/onionMarkers.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

// classifyParagraphMarker / isSectionMarker now DERIVE from the usfm-onion
// catalog's `paragraphCategory` (v0.0.5+), so the registry must be initialized.
beforeAll(async () => {
    initializeUsfmMarkerCatalog(await webUsfmOnionService.getMarkerCatalog());
});

describe("classifyParagraphMarker (catalog-derived)", () => {
    it.each([
        // poetry — paragraphCategory: "poetry"
        ["q", "poetry"],
        ["q1", "poetry"],
        ["qm2", "poetry"],
        ["qr", "poetry"],
        ["qd", "poetry"],
        // heading — paragraphCategory: "section"
        ["s", "heading"],
        ["s1", "heading"],
        ["sr", "heading"],
        ["ms", "heading"],
        ["ms1", "heading"],
        ["mr", "heading"],
        ["r", "heading"],
        ["d", "heading"],
        ["sp", "heading"],
        // rule — local app presentation grouping (upstream: body / other)
        ["b", "rule"],
        ["pb", "rule"],
        // list — paragraphCategory: "list"
        ["li", "list"],
        ["li2", "list"],
        ["lim", "list"],
        // paragraph — paragraphCategory: "body"
        ["p", "paragraph"],
        ["m", "paragraph"],
        ["pmo", "paragraph"],
        ["pi2", "paragraph"],
    ] as const)("classifies %s as %s", (marker, category) => {
        expect(classifyParagraphMarker(marker)).toBe(category);
    });

    it("classifies legacy markers the catalog omits via the local fallback", () => {
        // USFM 2.x / level-overflow markers upstream does not enumerate but WA
        // source data still uses — kept so they don't fall to a non-block.
        expect(classifyParagraphMarker("ms4")).toBe("heading");
        expect(classifyParagraphMarker("sb")).toBe("heading");
        expect(classifyParagraphMarker("ph1")).toBe("paragraph");
        expect(classifyParagraphMarker("ph2")).toBe("paragraph");
        expect(classifyParagraphMarker("hl")).toBe("paragraph");
    });

    it("adopts upstream's corrections for markers that should NOT be a block", () => {
        // litl is a CHARACTER marker (list total) and `no` is a NOTE submarker —
        // neither should ever start a paragraph block. The old hardcoded sets
        // wrongly listed them; the catalog corrects this.
        expect(classifyParagraphMarker("litl")).toBeNull();
        expect(classifyParagraphMarker("no")).toBeNull();
        // sts is `identification` (status metadata), not a body section heading.
        expect(classifyParagraphMarker("sts")).toBeNull();
    });

    it("reclassifies list header/footer as list (was paragraph) — still card-eligible", () => {
        expect(classifyParagraphMarker("lh")).toBe("list");
        expect(classifyParagraphMarker("lf")).toBe("list");
    });

    it("returns null for non-paragraph-class and title/introduction markers", () => {
        expect(classifyParagraphMarker("v")).toBeNull();
        expect(classifyParagraphMarker("c")).toBeNull();
        expect(classifyParagraphMarker("wj")).toBeNull();
        expect(classifyParagraphMarker("")).toBeNull();
        // title / introduction / identification are not form-mode blocks (never
        // were — these were absent from the old sets, and stay null).
        expect(classifyParagraphMarker("mt")).toBeNull();
        expect(classifyParagraphMarker("io")).toBeNull();
        expect(classifyParagraphMarker("h")).toBeNull();
    });
});

describe("isSectionMarker (paragraphCategory === 'section')", () => {
    it("matches the full section family, not just \\s1..\\sN", () => {
        expect(isSectionMarker("s")).toBe(true);
        expect(isSectionMarker("s1")).toBe(true);
        // Broader + more accurate than the old /^s\d+$/ regex: these are all
        // paragraphCategory "section".
        expect(isSectionMarker("ms")).toBe(true);
        expect(isSectionMarker("sr")).toBe(true);
        expect(isSectionMarker("sd")).toBe(true);
        expect(isSectionMarker("r")).toBe(true);
        expect(isSectionMarker("d")).toBe(true);
        // Legacy section markers the catalog omits.
        expect(isSectionMarker("ms4")).toBe(true);
        expect(isSectionMarker("sb")).toBe(true);
    });

    it("does NOT match non-section markers", () => {
        expect(isSectionMarker("p")).toBe(false); // body
        expect(isSectionMarker("q")).toBe(false); // poetry
        expect(isSectionMarker("li")).toBe(false); // list
        expect(isSectionMarker("mt")).toBe(false); // title
        expect(isSectionMarker("sts")).toBe(false); // identification
        expect(isSectionMarker("")).toBe(false);
    });
});
