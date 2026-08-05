import { i18n } from "@lingui/core";
import {
  Galley,
  rule_catalog,
  type FindingArgs,
  type SousConfig,
  type VrefCorpus,
} from "scripture-sous-chef-web";
import { beforeAll, describe, expect, it } from "vitest";

import { settingsDefaults } from "@/app/data/settings.ts";
import { decodeGalleyAnalysis } from "@/app/domain/editor/annotations/decodeGalleyFindings.ts";
import { formatFindingMessage } from "@/app/domain/editor/annotations/formatFindingMessage.ts";
import { sousFindingsToFindings } from "@/app/domain/editor/annotations/normalizeFindings.ts";
import {
  DEFAULT_FINDING_USER_PREFS,
  presentFinding,
} from "@/app/domain/editor/annotations/presentFinding.ts";
import { galleyConfigFromSettings } from "@/app/domain/sous/galleyConfig.ts";
import { localizeFindingCodeLabel } from "@/app/ui/i18n/findingCodeLabels.ts";
import { localizeSousFindingMessage } from "@/app/ui/i18n/sousLocalization.ts";

// `uni.nonletter-usage-anomaly` end-to-end from the editor's side: the shipped
// engine judges a synthetic translation, the packed snapshot comes back through
// the editor's own decode seam, and the editor's localizer renders it.
//
// It replaced `punct.spacing-anomaly`, `punct.adjacency-anomaly` and
// `lex.punct-only-token` (engine ADR 0071), so these are the cases that used to
// belong to three rules plus the two the old rules could not see at all
// (`th3e`, `wo"rd`).
//
// FIXTURE RULE, learned the hard way: this rule abstains rather than inventing a
// convention, so a fixture must first *establish* one. Placement needs a judged
// pool of 30+ and rarity needs 2,000+ visible non-letter occurrences corpus-wide
// at the default depth, which is why these corpora are ~520 verses of settled
// habit plus exactly one slip. A four-verse fixture correctly produces nothing.
const RULE = "uni.nonletter-usage-anomaly";
const CODE = RULE as string;

/** One settled habit: a comma attached to the word before it, a closing period. */
const SETTLED = "Now the word, and the word, and the word, and the word.";
const SLIP_INDEX = 100; // 40 verses per chapter ⇒ GEN 3:21
const SLIP_SID = "GEN 3:21";

function corpusOf(texts: string[]): VrefCorpus {
  return {
    keys: texts.map((_, i) => `GEN ${Math.floor(i / 40) + 1}:${(i % 40) + 1}`),
    texts,
  };
}

/** ~520 verses of one convention, with a single slip verse at `SLIP_SID`. */
function withSlip(slip: string, settled: string = SETTLED, count = 520) {
  const texts = Array.from({ length: count }, () => settled);
  texts[SLIP_INDEX] = slip;
  return texts;
}

type NonletterArgs = Extract<FindingArgs, { kind: "nonletter-usage" }>;

/**
 * Analyze through the editor's real seam: `Galley.analyze()` → the packed
 * buffer → `decodeGalleyAnalysis`. Lazy args are pulled straight off this
 * in-process Galley, which is what a detail surface will do across the worker
 * boundary once it asks for them.
 */
function analyze(texts: string[], config?: SousConfig) {
  const target = corpusOf(texts);
  const galley = new Galley(config ? { target, config } : { target });
  try {
    const bytes = galley.analyze();
    const result = decodeGalleyAnalysis({
      packed: new Uint8Array(bytes).slice().buffer,
      keys: target.keys,
      cacheState: "fresh",
    });
    const nonletter = result.findings.filter(
      (finding) => finding.code === CODE,
    );
    // Args are read out eagerly: they live in the Galley, which is freed below.
    const args = nonletter.map((finding): NonletterArgs => {
      const wireIndex = result.snapshot.findings.indexOf(
        finding.snapshotFinding!,
      );
      const payload = galley.findingArgs(result.snapshot.analysisId, wireIndex);
      if (payload?.kind !== "nonletter-usage") {
        throw new Error(`Expected nonletter-usage args, got ${payload?.kind}`);
      }
      return payload;
    });
    return { all: result.findings, nonletter, args };
  } finally {
    galley.free();
  }
}

/** The one finding on the slip verse, plus its evidence. */
function soleSlipFinding(texts: string[], config?: SousConfig) {
  const { nonletter, args, all } = analyze(texts, config);
  const index = nonletter.findIndex((finding) => finding.sid === SLIP_SID);
  expect(index, "the slip verse produced no finding").toBeGreaterThanOrEqual(0);
  return { finding: nonletter[index], args: args[index], all };
}

describe("uni.nonletter-usage-anomaly through the editor", () => {
  beforeAll(() => {
    i18n.load("en", {});
    i18n.activate("en");
  });

  it("names a barely-used glyph by how many places it appears in", () => {
    const { finding, args } = soleSlipFinding(
      withSlip("Now the word ~ and the word."),
    );

    expect(args.reason).toBe("rarity");
    expect(args.glyph).toBe("~");
    // Leave-one-out over *places*: 0 others means this is the only one.
    expect(args.count).toBe(0);
    expect(finding.severity).toBe("info");
    expect(localizeSousFindingMessage(finding.code, args)).toBe(
      "‘~’ appears in only one place in this translation.",
    );
  });

  it("flags a digit inside a word, wording it as the start marginal", () => {
    // The engine's canonical example, and a deliberate wording weakening
    // recorded in ADR 0071: the score is unchanged, but the digit's
    // class-conditioned `Both` cell holds only this occurrence and honestly
    // abstains, so the *start* marginal names the finding. Asserting "both
    // ends" here would be asserting behavior that does not ship.
    const digitsAreOrdinary =
      "In the year 12, the word, and 34 more, and the word.";
    const { args } = soleSlipFinding(
      withSlip("Now th3e word, and the word.", digitsAreOrdinary),
    );

    expect(args.glyph).toBe("3");
    expect([args.reason, args.form]).toEqual(["start", "letter"]);
    expect(localizeSousFindingMessage(CODE, args)).toContain(
      "attached to a word at the start",
    );
  });

  it("flags a period inside a word through the four-state topology", () => {
    const { args } = soleSlipFinding(withSlip("Now the wo.rd, and the word."));

    expect(args.glyph).toBe(".");
    expect([args.reason, args.form]).toEqual(["topology", "both"]);
    expect(localizeSousFindingMessage(CODE, args)).toBe(
      `‘.’ is attached to text at both ends here; this translation writes it that way in ${args.count} of ${args.total} other places.`,
    );
  });

  it("flags a quote attached at both ends though both one-sided forms are ordinary", () => {
    // The case the four-state topology exists for. `"word` (start-only) and
    // `word"` (end-only) are both settled here; `wo"rd` is neither.
    const quoted = 'He said, "the word, and the word," and left.';
    const { args } = soleSlipFinding(
      withSlip('He said, "the wo"rd, and the word," and left.', quoted),
    );

    expect(args.glyph).toBe('"');
    expect([args.reason, args.form]).toEqual(["topology", "both"]);
  });

  it("covers an unpaired bracket the translation never pairs, where bracket balance abstains", () => {
    // §11.4's corrected wording: unpaired delimiters are corpus-relative. This
    // translation has no bracket pairing convention at all, so
    // `punct.bracket-balance` has no dominance to assert and stays silent — and
    // the generic rule picks the glyph up as a rarity finding instead.
    const { finding, args, all } = soleSlipFinding(
      withSlip("Now the word] and the word."),
    );

    expect(args.glyph).toBe("]");
    expect(args.reason).toBe("rarity");
    expect(all.map((f) => f.code)).not.toContain("punct.bracket-balance");
    expect(finding.sid).toBe(SLIP_SID);
  });

  it("flags an unusual ordering after a quote as a directed pair", () => {
    // The plain-language example the rule was designed around: `. → ,` occurs
    // here and nowhere else, while every other period pairing is established.
    const closingQuote = 'He said, "the word." Then the word.';
    const { args } = soleSlipFinding(
      withSlip('He said, "the word., Then the word.', closingQuote),
    );

    expect(args.reason).toBe("pair");
    expect(args.glyph).toBe(".");
    expect(args.partner).toBe(",");
    expect(localizeSousFindingMessage(CODE, args)).toContain(
      "is written directly before ‘,’",
    );
  });

  it("flags a longer same-glyph run than the translation otherwise writes", () => {
    // Directed pairs cannot reach this: both edges of `:::` are familiar.
    const doubled = "The word :: the word, and the word.";
    const { args } = soleSlipFinding(
      withSlip("The word ::: the word, and the word.", doubled),
    );

    expect(args.reason).toBe("continuation");
    expect(args.glyph).toBe(":");
    expect(localizeSousFindingMessage(CODE, args)).toContain(
      "is repeated in a longer run",
    );
  });

  it("flags a detached mark, wording it as the spaced start marginal", () => {
    // Same accepted weakening as `th3e`: the `Detached` cell's only possible
    // state IS `Neither`, so it is degenerate as well as thin and the start
    // marginal names the finding (ADR 0071).
    const { args } = soleSlipFinding(withSlip("Now the word . and the word."));

    expect(args.glyph).toBe(".");
    expect([args.reason, args.form]).toEqual(["start", "spaced"]);
    expect(localizeSousFindingMessage(CODE, args)).toContain(
      "is spaced away at the start",
    );
  });

  it("shows more as Review Depth moves toward exploratory", () => {
    const texts = withSlip("Now the word ~ and the wo.rd , and the word] .");
    const at = (depth: number) =>
      analyze(texts, { review: { depth } }).nonletter.length;

    const strict = at(0);
    const shipped = at(50);
    const exploratory = at(100);

    expect(strict).toBeGreaterThan(0);
    expect(shipped).toBeGreaterThanOrEqual(strict);
    expect(exploratory).toBeGreaterThanOrEqual(shipped);
    expect(exploratory).toBeGreaterThan(strict);
    // The depth the settings surface ships with is the engine's own anchor.
    expect(settingsDefaults.proofreading.depth).toBe(
      rule_catalog().review_depth.default,
    );
    expect(at(settingsDefaults.proofreading.depth)).toBe(shipped);
  });

  it("presents and filters like any other content finding", () => {
    const { finding } = soleSlipFinding(
      withSlip("Now the word ~ and the word."),
    );
    const [normalized] = sousFindingsToFindings([finding]);

    expect(normalized.source).toBe("sous-chef");
    expect(normalized.category).toBe("content");
    // Rendered with no args, which is what the live pipeline has today: the
    // packed record carries only a `hasArgs` bit.
    expect(formatFindingMessage(normalized)).toBe(
      "A non-letter used in a way this translation almost never uses it.",
    );

    const inputs = {
      userPrefs: DEFAULT_FINDING_USER_PREFS,
      suppressions: [],
      mode: "regular" as const,
      surface: "overlay" as const,
      bookCode: "GEN",
    };
    expect(presentFinding(normalized, inputs)).toBe("highlight");
    expect(presentFinding(normalized, { ...inputs, surface: "panel" })).toBe(
      "list",
    );
    // The filter ribbon selects it by code, so it needs a real chip label.
    expect(localizeFindingCodeLabel(CODE)).toBe("Unusual nonletter usage");
    expect(
      presentFinding(normalized, {
        ...inputs,
        userPrefs: {
          ...DEFAULT_FINDING_USER_PREFS,
          codesMatchAll: false,
          selectedCodes: ["lex.excess-h-whitespace"],
        },
      }),
    ).toBe("hide");
  });
});

describe("uni.nonletter-usage-anomaly settings and catalog", () => {
  beforeAll(() => {
    i18n.load("en", {});
    i18n.activate("en");
  });

  it("ships as a default-on, Review-Depth-mapped card", () => {
    const card = rule_catalog().cards.find((entry) => entry.code === RULE);

    expect(card).toBeDefined();
    expect(card!.title).toBe("Unusual nonletter usage");
    expect(card!.verdict).toBe("corpus-relative");
    expect(card!.review_control).toBe("mapped");
    // No enable question: it is not a language-dependent toggle.
    expect(card!.enable_question).toBeNull();
    // Default settings carry no explicit row, and the engine default is on.
    expect(settingsDefaults.proofreading.rules[RULE]).toBeUndefined();
    expect(galleyConfigFromSettings(settingsDefaults).rules?.[RULE]).toBe(true);
  });

  it("carries no trace of the three rules it replaced", () => {
    const retired = [
      "punct.spacing-anomaly",
      "punct.adjacency-anomaly",
      "lex.punct-only-token",
    ];
    const codes = rule_catalog().cards.map((card) => card.code as string);

    for (const id of retired) {
      expect(codes).not.toContain(id);
      // And nothing localizes them any more — an unmapped code degrades to the
      // humanizer, which is how we can tell a real mapping from a leftover.
      expect(localizeFindingCodeLabel(id)).toBe(
        id
          .slice(id.indexOf(".") + 1)
          .replace(/-/g, " ")
          .replace(/^./, (c) => c.toUpperCase()),
      );
    }
  });
});

describe("nonletter-usage message localization", () => {
  beforeAll(() => {
    i18n.load("en", {});
    i18n.activate("en");
  });

  const args = (overrides: Partial<NonletterArgs>): NonletterArgs => ({
    kind: "nonletter-usage",
    glyph: ",",
    reason: "rarity",
    form: "none",
    partner: "",
    count: 3,
    total: 1601,
    also: [],
    ...overrides,
  });

  // Every (reason, form) pair the engine can publish, and the habit phrase each
  // must name. The engine's own enums are closed, so this table is the editor's
  // proof that none of them renders a raw identifier or a leftover placeholder.
  const cases: Array<[NonletterArgs["reason"], NonletterArgs["form"], string]> =
    [
      ["start", "letter", "attached to a word at the start"],
      ["start", "digit", "attached to a number at the start"],
      ["start", "spaced", "spaced away at the start"],
      ["start", "none", "spaced away at the start"],
      ["end", "letter", "attached to a word at the end"],
      ["end", "digit", "attached to a number at the end"],
      ["end", "spaced", "spaced away at the end"],
      ["end", "none", "spaced away at the end"],
      ["topology", "both", "attached to text at both ends"],
      ["topology", "start-only", "attached to text at the start only"],
      ["topology", "end-only", "attached to text at the end only"],
      ["topology", "neither", "standing detached from the text"],
      ["pair", "none", "written directly before"],
      ["continuation", "none", "repeated in a longer run"],
    ];

  it.each(cases)(
    "renders %s/%s as a counted sentence",
    (reason, form, habit) => {
      const message = localizeSousFindingMessage(
        CODE,
        args({ reason, form, partner: ";" }),
      );

      expect(message).toContain(habit);
      expect(message).toContain("3 of 1601 other places");
      expect(message).not.toContain("{");
      expect(message).not.toContain(RULE);
    },
  );

  it("counts places, not occurrences, for rarity", () => {
    // Rarity's counts are leave-one-out over maximal non-letter runs, so
    // `count` others means `count + 1` places — and one place is a sentence of
    // its own rather than "only 1 places".
    expect(localizeSousFindingMessage(CODE, args({ count: 0 }))).toBe(
      "‘,’ appears in only one place in this translation.",
    );
    expect(localizeSousFindingMessage(CODE, args({ count: 4 }))).toBe(
      "‘,’ appears in only 5 places in this translation.",
    );
  });

  it("falls back to an evidence-free sentence when args are absent", () => {
    // The live path: packed records carry a `hasArgs` bit, not the args.
    const expected =
      "A non-letter used in a way this translation almost never uses it.";
    expect(localizeSousFindingMessage(CODE)).toBe(expected);
    expect(localizeSousFindingMessage(CODE, null)).toBe(expected);
    // And a mismatched payload never leaks another rule's wording.
    expect(
      localizeSousFindingMessage(CODE, {
        kind: "rare-glyph",
        glyph: "q",
        count: 2,
      }),
    ).toBe(expected);
  });
});
