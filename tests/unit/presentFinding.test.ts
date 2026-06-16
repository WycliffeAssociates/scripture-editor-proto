// The presentation-policy table — this test IS the readable product spec
// (findings plan §10). Initial table = today's behavior verbatim: user
// filters narrow, the `\s5` app-default row hides everywhere, form shape
// hides the overlay, everything else presents per surface.

import { describe, expect, it } from "vitest";

import { EDITOR_MODES, type EditorModeSetting } from "@/app/data/editor.ts";
import {
  lintIssuesToFindings,
  onionFindingsByChapter,
  sousFindingsToFindings,
} from "@/app/domain/editor/annotations/normalizeFindings.ts";
import {
  DEFAULT_FINDING_USER_PREFS,
  type FindingSurface,
  type FindingUserPrefs,
  presentFinding,
} from "@/app/domain/editor/annotations/presentFinding.ts";
import { flattenFindings } from "@/app/state/findingsSelectors.ts";
import { FindingsStore } from "@/app/state/FindingsStore.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

function makeIssue(overrides: Partial<LintIssue> = {}): LintIssue {
  return {
    message: "msg",
    template: "msg",
    code: "unknown-token",
    category: "structure",
    severity: "warning",
    issueType: "usfm",
    messageParams: {},
    sid: "GEN 1:1",
    tokenId: "n1",
    span: { start: 0, end: 1 },
    ...overrides,
  } as LintIssue;
}

function onionFinding(overrides: Partial<LintIssue> = {}) {
  return lintIssuesToFindings([makeIssue(overrides)])[0];
}

function sousFinding() {
  return sousFindingsToFindings([
    {
      sid: "GEN 1:1",
      code: "lex.excess-h-whitespace",
      severity: "warning",
      start: 0,
      end: 2,
    },
  ])[0];
}

const NEUTRAL = {
  userPrefs: DEFAULT_FINDING_USER_PREFS,
  suppressions: [] as const,
  /** Store-address book of the test findings (all anchored in GEN). */
  bookCode: "GEN",
};

const ALL_MODES: EditorModeSetting[] = [
  "regular",
  "usfm",
  "plain",
  "view",
  "form",
];
const ALL_SURFACES: FindingSurface[] = ["overlay", "panel"];

describe("presentFinding — app-default rows", () => {
  it("hides the \\s5 unknown-marker finding on EVERY surface in EVERY mode", () => {
    const s5 = onionFinding({ code: "unknown-marker", marker: "s5" });
    for (const mode of ALL_MODES) {
      for (const surface of ALL_SURFACES) {
        expect(presentFinding(s5, { ...NEUTRAL, mode, surface })).toBe("hide");
      }
    }
  });

  it("does NOT hide unknown-marker for other markers, nor other codes on s5's token", () => {
    const otherMarker = onionFinding({
      code: "unknown-marker",
      marker: "zz",
    });
    const otherCode = onionFinding({ code: "unclosed-marker", marker: "s5" });
    expect(
      presentFinding(otherMarker, {
        ...NEUTRAL,
        mode: "regular",
        surface: "panel",
      }),
    ).toBe("list");
    expect(
      presentFinding(otherCode, {
        ...NEUTRAL,
        mode: "regular",
        surface: "panel",
      }),
    ).toBe("list");
  });

  it("a stored-but-hidden finding exists raw but survives NO policy-filtered view (the leak test)", () => {
    const store = new FindingsStore();
    store.commitBookFindings(
      "onion",
      "GEN",
      onionFindingsByChapter([
        makeIssue({ code: "unknown-marker", marker: "s5" }),
        makeIssue({ tokenId: "n2" }),
      ]),
    );
    const flat = flattenFindings(store.read());
    expect(flat).toHaveLength(2); // transparency: the store holds what the analyzers said
    const shown = flat.filter(
      (entry) =>
        presentFinding(entry.finding, {
          ...NEUTRAL,
          mode: "regular",
          surface: "panel",
        }) !== "hide",
    );
    expect(shown).toHaveLength(1); // ...but no count/list built on policy sees it
    expect(shown[0].finding.code).toBe("unknown-token");
  });
});

describe("presentFinding — user intent (strongest)", () => {
  const prefs = (overrides: Partial<FindingUserPrefs>): FindingUserPrefs => ({
    ...DEFAULT_FINDING_USER_PREFS,
    ...overrides,
  });

  it("category filter narrows across producers (sous is content; onion usfm is structure)", () => {
    const usfm = onionFinding();
    const content = sousFinding();
    const inputs = {
      suppressions: [],
      mode: "regular",
      surface: "panel",
      bookCode: "GEN",
    } as const;

    expect(
      presentFinding(usfm, {
        ...inputs,
        userPrefs: prefs({ category: "content" }),
      }),
    ).toBe("hide");
    expect(
      presentFinding(content, {
        ...inputs,
        userPrefs: prefs({ category: "content" }),
      }),
    ).toBe("list");
  });

  it("code filter applies only when not matching all", () => {
    const finding = onionFinding();
    const base = {
      suppressions: [],
      mode: "regular",
      surface: "panel",
      bookCode: "GEN",
    } as const;
    expect(
      presentFinding(finding, {
        ...base,
        userPrefs: prefs({ codesMatchAll: true, selectedCodes: [] }),
      }),
    ).toBe("list");
    expect(
      presentFinding(finding, {
        ...base,
        userPrefs: prefs({
          codesMatchAll: false,
          selectedCodes: ["verse-is-empty"],
        }),
      }),
    ).toBe("hide");
  });

  it("book filter applies in `all` scope only (where the filter is offered)", () => {
    const finding = onionFinding({ sid: "GEN 1:1" });
    const base = {
      suppressions: [],
      mode: "regular",
      surface: "panel",
      bookCode: "GEN",
    } as const;
    const narrowed = {
      booksMatchAll: false,
      selectedBooks: ["EXO"],
    };
    expect(
      presentFinding(finding, {
        ...base,
        userPrefs: prefs({ ...narrowed, scope: "all" }),
      }),
    ).toBe("hide");
    expect(
      presentFinding(finding, {
        ...base,
        userPrefs: prefs({ ...narrowed, scope: "local" }),
      }),
    ).toBe("list");
  });

  it("book filter compares the STORE address, so a no-sid front-matter finding matches its book's selection", () => {
    // Stored under GEN by the pipeline's scope; the books menu offers GEN
    // from the same address. Selecting GEN must keep it visible even
    // though its sid can't say which book it belongs to.
    const noSid = onionFinding({ sid: undefined, tokenId: "h1" });
    expect(
      presentFinding(noSid, {
        suppressions: [],
        mode: "regular",
        surface: "panel",
        bookCode: "GEN",
        userPrefs: prefs({
          scope: "all",
          booksMatchAll: false,
          selectedBooks: ["GEN"],
        }),
      }),
    ).toBe("list");
  });
});

describe("presentFinding — mode/shape defaults per surface", () => {
  it("overlay presents highlights everywhere except form shape", () => {
    const finding = onionFinding();
    for (const mode of ALL_MODES) {
      expect(
        presentFinding(finding, {
          ...NEUTRAL,
          mode,
          surface: "overlay",
        }),
      ).toBe(mode === EDITOR_MODES.form ? "hide" : "highlight");
    }
  });

  it("panel lists in every mode (triage is never mode-gated today)", () => {
    const finding = sousFinding();
    for (const mode of ALL_MODES) {
      expect(
        presentFinding(finding, { ...NEUTRAL, mode, surface: "panel" }),
      ).toBe("list");
    }
  });
});
