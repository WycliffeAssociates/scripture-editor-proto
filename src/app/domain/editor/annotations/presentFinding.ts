// presentFinding.ts
//
// THE presentation policy: one pure decision function answering "how does
// this finding present on this surface right now?" for every finding and
// every surface. All visibility rules live in this file's table — changing
// product policy is a one-file diff, and a new producer/mode/surface is
// compiler-escorted through the decision it owes.
//
// NOT a monotonic filter sieve: precedence is user intent strongest (both
// directions — "never show me X" and "show me X even here"), then
// suppressions, then app-default rows, then mode/shape defaults deciding how
// degraded the presentation is. The initial table transcribes today's
// behavior verbatim; rows change by product decision, not refactor.
//
// The store deliberately holds findings this policy hides (the store is what
// the analyzers said; policy is what we show) — so EVERY count, badge, and
// list must read through policy-filtered selectors, never the raw store.

import {
    type EditorModeSetting,
    editorModeToShape,
} from "@/app/data/editor.ts";
import type { Finding, FindingCategory } from "./finding.ts";

/**
 * Where a finding would present. `overlay` is the in-editor layer (highlight
 * boxes, badges, and the hover popover that opens off them); `panel` is the
 * workspace issues list. Future command surfaces extend the union.
 */
export type FindingSurface = "overlay" | "panel";

export type FindingPresentation =
    | "highlight" // overlay: draw at the anchor (the overlay itself degrades to a nearest-verse badge when the exact token isn't rendered — a DOM capability fact, not a policy row)
    | "badge" // overlay: present only as the nearest-verse badge (no row forces this today; reserved for mode policy)
    | "list" // panel: listed and navigable, not DOM-anchored
    | "hide";

/**
 * The user's sticky filter choices (the panel's filter ribbon — shared with
 * the overlay so both surfaces show one consistent picture). Global and
 * orthogonal to mode policy.
 */
export type FindingUserPrefs = {
    /** Panel scope tab; also gates whether the book filter applies. */
    scope: "local" | "all";
    category: "all" | FindingCategory;
    /** Selected lint/sous codes; `codesMatchAll` skips the check so newly-arrived codes aren't silently excluded. */
    selectedCodes: string[];
    codesMatchAll: boolean;
    /** Selected books (applies in `all` scope, where the books filter is offered). */
    selectedBooks: string[];
    booksMatchAll: boolean;
};

export const DEFAULT_FINDING_USER_PREFS: FindingUserPrefs = {
    scope: "local",
    category: "all",
    selectedCodes: [],
    codesMatchAll: true,
    selectedBooks: [],
    booksMatchAll: true,
};

/**
 * Reserved input: the future hash-and-ignore feature feeds this (suppressions
 * keyed on a content hash of the matched substring, persisted and hashed on
 * boot). Always empty today; the matching semantics arrive with that feature
 * — its own design pass. The precedence slot below is already carved out.
 */
export type FindingSuppressions = ReadonlyArray<unknown>;

export type PresentFindingInputs = {
    userPrefs: FindingUserPrefs;
    suppressions: FindingSuppressions;
    /** User intent (what they asked to edit in). */
    mode: EditorModeSetting;
    surface: FindingSurface;
    /**
     * The finding's store-address book (the commit's authoritative scope).
     * Callers always have it — flat selectors carry it, chapter selectors are
     * book-scoped. NEVER derived from sids here: the book options the user
     * picks from are built from store addresses, so the filter must compare
     * against the same address space (a no-sid front-matter finding stored
     * under GEN must match a GEN selection).
     */
    bookCode: string;
};

function matchesUserPrefs(
    finding: Finding,
    bookCode: string,
    prefs: FindingUserPrefs,
): boolean {
    if (prefs.category !== "all" && finding.category !== prefs.category) {
        return false;
    }
    if (!prefs.codesMatchAll && !prefs.selectedCodes.includes(finding.code)) {
        return false;
    }
    // The books filter is offered (and applies) only in `all` scope.
    if (
        prefs.scope === "all" &&
        !prefs.booksMatchAll &&
        !prefs.selectedBooks.includes(bookCode)
    ) {
        return false;
    }
    return true;
}

/**
 * App-default rows — ecosystem decisions, not user choices. The first row:
 * legacy chunked projects use `\s5` deliberately (a USFM 2.x chunk
 * delimiter), so its `unknown-marker` finding is hidden everywhere — an
 * ecosystem-wide rule, not a user suppression.
 */
function hiddenByAppDefault(finding: Finding): boolean {
    return (
        finding.source === "onion" &&
        finding.code === "unknown-marker" &&
        finding.issue.marker === "s5"
    );
}

export function presentFinding(
    finding: Finding,
    inputs: PresentFindingInputs,
): FindingPresentation {
    // 1. User intent (strongest, both directions). Today's prefs only narrow;
    //    a future "show me USFM even here" upgrades AHEAD of the rows below.
    if (!matchesUserPrefs(finding, inputs.bookCode, inputs.userPrefs)) {
        return "hide";
    }

    // 2. Suppressions — reserved slot, no semantics until the hash-and-ignore
    //    feature ships (see FindingSuppressions).

    // 3. App-default rows.
    if (hiddenByAppDefault(finding)) return "hide";

    // 4. Mode/shape defaults per surface. Shape answers capability questions
    //    (derived, not an input — usfm and plain are both `flat`, so a
    //    plain-opts-out row would key on MODE).
    const shape = editorModeToShape(inputs.mode);
    switch (inputs.surface) {
        case "overlay":
            // Form shape renders verses inside decorator cards; anchor
            // resolution against the underlying tree is meaningless, and form
            // mode has its own per-card affordance.
            if (shape === "form") return "hide";
            return "highlight";
        case "panel":
            return "list";
    }
}
