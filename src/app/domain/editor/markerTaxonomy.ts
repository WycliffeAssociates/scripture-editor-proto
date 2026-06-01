// markerTaxonomy.ts
//
// Single source of truth for the app's paragraph-marker CATEGORIES (the
// form-mode presentation classes) and the section-heading test.
//
// Categories derive from the usfm-onion catalog's `paragraphCategory`:
// `section` → heading, `poetry` → poetry, `list` → list, `body` → paragraph.
// Markers the catalog classifies `identification`/`introduction`/`title`/
// `table`/`peripheral`/`other` are not form-mode blocks and return `null`.
//
// Two small maps stay local:
//   1. RULE (`\b`/`\pb`) — an app PRESENTATION grouping with no upstream
//      equivalent. The catalog models `b` as `body` (stanza break) and `pb` as
//      `other` (page break), semantically unrelated, so "rule" is the app's.
//   2. Legacy/overflow markers the catalog does not enumerate but WA source data
//      uses (USFM 2.x `\ph*`, `\hl`; level-overflow `\ms4`, `\sb`). Without
//      these they'd fall to `null` (no form-mode block) and break rendering of
//      legacy files.

import { getParagraphCategory } from "@/core/domain/usfm/onionMarkers.ts";
import type { ParagraphCategory } from "@/core/domain/usfm/usfmOnionTypes.ts";

export type ParagraphMarkerCategory =
    | "poetry"
    | "heading"
    | "rule"
    | "list"
    | "paragraph";

/**
 * App presentation grouping with no upstream equivalent: blank-line and
 * page-break separators. Checked before the catalog so it wins over upstream's
 * `body`/`other`.
 */
const RULE_MARKERS = new Set(["b", "pb"]);

/**
 * App-supported paragraph markers the catalog does NOT enumerate, mapped to the
 * form-mode category they should keep: USFM 2.x legacy (`\ph*`, `\hl`) and
 * markers beyond the catalog's level caps (`\ms4`, `\sb`). Delete entries here
 * if the catalog gains them.
 */
const LOCAL_UNCATALOGED_MARKERS: Record<string, ParagraphMarkerCategory> = {
    ms4: "heading",
    sb: "heading",
    ph1: "paragraph",
    ph2: "paragraph",
    ph3: "paragraph",
    hl: "paragraph",
};

/** Project the catalog's semantic category onto a form-mode block category. */
function formCategoryForParagraphCategory(
    category: ParagraphCategory,
): ParagraphMarkerCategory | null {
    switch (category) {
        case "section":
            return "heading";
        case "poetry":
            return "poetry";
        case "list":
            return "list";
        case "body":
            return "paragraph";
        // identification / introduction / title / table / peripheral / other:
        // not a form-mode block.
        default:
            return null;
    }
}

/**
 * Classify a marker into its form-mode paragraph category, or `null` when the
 * marker is not paragraph-class (and therefore should not start a new block).
 */
export function classifyParagraphMarker(
    marker: string,
): ParagraphMarkerCategory | null {
    // Local overrides first: the app's "rule" grouping and the legacy markers
    // the catalog omits both take precedence over (or stand in for) the catalog.
    if (RULE_MARKERS.has(marker)) return "rule";
    const local = LOCAL_UNCATALOGED_MARKERS[marker];
    if (local) return local;

    const category = getParagraphCategory(marker);
    return category ? formCategoryForParagraphCategory(category) : null;
}

/**
 * Is this a section-heading marker (`\s`, `\ms`, `\sr`, `\d`, `\r`, …)? Derives
 * from `paragraphCategory === "section"`. The canonical section test; callers
 * that already check paragraph-validity get this for free, but it stands alone
 * for any direct consumer.
 */
export function isSectionMarker(marker: string): boolean {
    if (marker === "ms4" || marker === "sb") return true;
    return getParagraphCategory(marker) === "section";
}
