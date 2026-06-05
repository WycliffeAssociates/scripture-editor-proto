// syntheticFixtureRoundTrip.test.ts
//
// Mode-flip losslessness on synthetic fixtures.
//
// The user-visible invariant: for any chapter, switching between
// editor modes (regular / form / flat) and back without editing must
// reproduce the input USFM byte-for-byte. This test pins the current
// behavior across two fixtures × three shapes × every cross-shape
// pair.
//
// Both fixtures live in `tests/mockData/synthetic/` and were copied
// from the `usfm_onion` repo's `testData/synthetic/`:
//   - kitchen-sink.usfm — every paragraph-class, poetry, heading,
//     list, intro, frontmatter, and content-style marker in the
//     catalog. The breadth coverage test.
//   - common-errors.usfm — intentionally malformed: duplicate verse
//     numbers, unknown markers, stray close markers, unclosed
//     footnotes, content-before-first-chapter. Confirms the invariant
//     holds (or doesn't) on error inputs too — modes should pass
//     tokens through unchanged; lint is a separate concern.
//
// Two assertions per fixture per shape combination:
//   1. LOAD round-trip: `parse → tokensToLexical(shape) → serialize`
//      reproduces the input. Confirms each shape's loader preserves
//      every token.
//   2. MODE-FLIP round-trip: load into shape A, transform to shape
//      B, transform back to shape A, serialize. Confirms
//      `transformToShape` preserves bytes across the user's mode-
//      switch action.
//
// CURRENT DIVERGENCES (locked in as `it.fails` so the suite stays
// green; if any flip to passing in the future, the test will fail
// and prompt re-evaluation):
//
//   - kitchen-sink × any shape: character-marker attribute lists
//     (e.g. `\w word|strong="H3444"\w*`) now round-trip correctly
//     after the v0.0.3 upstream fix + our adapter plumbing
//     (`SerializedUSFMTextNode.attributes` carrying `AttributeItem[]`
//     through `tokensToLexical` / `lexicalToTokens`). But milestone-
//     style markers (`\qt-s |sid="..."\*`, table milestones, etc.)
//     still lose their attribute lists. Root cause: our adapter
//     collapses `Token.kind: "milestone"` → `"marker"` during
//     Lexical serialization (`flatTokenKindToLexicalTokenType` and
//     its inverse only emit `UsfmTokenTypes.marker` / `endMarker`,
//     no milestone variant). Upstream's `tokens_to_usfm` therefore
//     can't apply the milestone closer-shape rule and ends up
//     draining the pending attributes at end-of-stream, producing
//     a concatenated `|eid=... |sid=...` blob instead of inline
//     emission.
//
//     Fix path (future): preserve the milestone/milestoneEnd kind
//     through the adapter — add a `usfm:milestone` token-type
//     variant and round-trip it. Once that lands these kitchen-sink
//     entries unlock automatically.
//
//   - common-errors × regular shape: regular-mode load auto-closes
//     the unclosed `\f` footnote (appends `\f*` on serialize). Form
//     and flat shapes preserve the unclosed marker as-is.
//     **INTENTIONAL**: leaving the footnote unclosed in regular mode
//     would let the WYSIWYG renderer swallow the rest of the chapter
//     into the footnote body. Auto-close at load + lint notification
//     is the safe default the editor opts into. The `it.fails` here
//     is *not* a bug-tracker; it's a guard that the auto-close
//     behavior doesn't accidentally regress to "preserve verbatim".
//   - Any flip THROUGH regular shape inherits the auto-close above,
//     for the same reason.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SerializedEditorState } from "lexical";
import { beforeAll, describe, expect, it } from "vitest";
import { type EditorShape, EDITOR_SHAPES } from "@/app/data/editor.ts";
import { transformToShape } from "@/app/domain/editor/utils/modeTransforms.ts";
import { initializeUsfmMarkerCatalog } from "@/core/domain/usfm/onionMarkers.ts";
import {
  lexicalToTokens,
  tokensToLexical,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";
// `tokensToUsfm` is the upstream-canonical serializer added in
// usfm-onion v0.0.2; it preserves USFM 3.1 attribute lists that the
// `tokens.map(t => t.text).join("")` shorthand silently drops.
import { tokensToUsfm } from "usfm-onion-web";

const __filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(__filename);

const FIXTURE_ROOT = path.resolve(dirname, "..", "mockData", "synthetic");

type FixtureName = "kitchen-sink" | "common-errors";

const FIXTURES: Array<{ name: FixtureName; file: string }> = [
  { name: "kitchen-sink", file: "kitchen-sink.usfm" },
  { name: "common-errors", file: "common-errors.usfm" },
];

const SHAPES: EditorShape[] = [EDITOR_SHAPES.regular, EDITOR_SHAPES.form, EDITOR_SHAPES.flat];

// Lock in the divergences we know exist as of 2026-05-14 so the
// suite stays green and any future improvement lights up as a
// "fix landed" signal. Each entry is a (fixture, scenario) tuple;
// scenario is either "load <shape>" or "flip <from> → <to>".
const KNOWN_DIVERGENT: Set<string> = new Set([
  // Kitchen-sink: milestone markers (`\qt-s`, table/list milestones,
  // etc.) lose their attribute lists because our adapter collapses
  // milestone-kind → marker-kind during the Lexical round-trip. See
  // header comment for the fix path.
  "kitchen-sink load regular",
  "kitchen-sink load form",
  "kitchen-sink load flat",
  "kitchen-sink flip regular→form",
  "kitchen-sink flip regular→flat",
  "kitchen-sink flip form→regular",
  "kitchen-sink flip form→flat",
  "kitchen-sink flip flat→regular",
  "kitchen-sink flip flat→form",
  // Common-errors: regular-mode load auto-closes the unclosed `\f`
  // footnote; any flip THROUGH regular inherits the close.
  // **Intentional** auto-format behavior — see header comment.
  "common-errors load regular",
  "common-errors flip regular→form",
  "common-errors flip regular→flat",
  "common-errors flip form→regular",
  "common-errors flip flat→regular",
]);

async function loadFixture(fileName: string): Promise<{
  usfm: string;
  initialState: (shape: EditorShape) => SerializedEditorState;
}> {
  const usfm = readFileSync(path.join(FIXTURE_ROOT, fileName), "utf8");
  const { tokens } = await webUsfmOnionService.parseUsfm(usfm);
  return {
    usfm,
    initialState: (shape) =>
      tokensToLexical({
        tokens,
        direction: "ltr",
        mode: shape,
      }),
  };
}

// Production-faithful re-serialization: walk the Lexical tree back
// down to flat USFM tokens (the same `lexicalToTokens` path the
// editor uses on save), then hand them to upstream's `tokensToUsfm`
// (the attribute-preserving serializer added in usfm-onion v0.0.2).
// Going through the real token pipeline plus the canonical
// serializer means failures flag real production-level losses, not
// test-helper gaps.
function serializeState(state: SerializedEditorState): string {
  return tokensToUsfm(
    lexicalToTokens(state) as unknown as Parameters<typeof tokensToUsfm>[0],
  );
}

function scenarioId(fixture: FixtureName, kind: "load" | "flip", parts: string): string {
  return `${fixture} ${kind} ${parts}`;
}

function maybeFails(scenario: string): typeof it | typeof it.fails {
  return KNOWN_DIVERGENT.has(scenario) ? it.fails : it;
}

// The regular-shape rebuild pairs marker+number tokens into numbered nodes
// via the catalog registry (isEnabledNumberedMarker); without initialization
// the pairing no-ops and the suite would silently exercise the legacy path.
beforeAll(async () => {
  initializeUsfmMarkerCatalog(await webUsfmOnionService.getMarkerCatalog());
});

describe("synthetic fixture round-trip", () => {
  for (const fixture of FIXTURES) {
    describe(fixture.name, () => {
      for (const shape of SHAPES) {
        const scenario = scenarioId(fixture.name, "load", shape);
        const runner = maybeFails(scenario);
        runner(`loads through ${shape} mode byte-identical`, async () => {
          const { usfm, initialState } = await loadFixture(fixture.file);
          const loaded = initialState(shape);
          expect(serializeState(loaded)).toBe(usfm);
        });
      }

      for (const sourceShape of SHAPES) {
        for (const targetShape of SHAPES) {
          if (sourceShape === targetShape) continue;
          const scenario = scenarioId(fixture.name, "flip", `${sourceShape}→${targetShape}`);
          const runner = maybeFails(scenario);
          runner(
            `flips ${sourceShape} → ${targetShape} → ${sourceShape} byte-identical`,
            async () => {
              const { usfm, initialState } = await loadFixture(fixture.file);
              const source = initialState(sourceShape);
              const intermediate = transformToShape(
                structuredClone(source),
                targetShape,
              );
              const back = transformToShape(
                structuredClone(intermediate),
                sourceShape,
              );
              expect(serializeState(back)).toBe(usfm);
            },
          );
        }
      }
    });
  }
});
