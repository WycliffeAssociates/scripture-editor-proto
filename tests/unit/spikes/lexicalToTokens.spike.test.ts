// SPIKE (stateful-findings-and-workers arc, Phase 0 / S1).
// Benchmarks `lexicalToTokens` per-chapter main-thread cost to decide whether
// per-commit tokenization rides the commit hot path optimistically or defers
// to first patch flush. Delete this file when the arc finishes.
//
// Method: parse real Psalms USFM (Berean Standard Bible fixture), slice out a
// small chapter (Psalm 117) and the largest chapter in the Bible (Psalm 119,
// 176 verses), build the serialized Lexical state the editor would hold
// (regular shape — the default editing shape), then time
// `lexicalToTokens(state, { bookCode })` exactly as `WorkingFilesStore`
// calls it on commit. Numbers recorded in
// agent-tmp/plans/stateful-findings-and-workers/spikes.md.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SerializedEditorState } from "lexical";
import { beforeAll, describe, expect, it } from "vitest";

import { EDITOR_SHAPES } from "@/app/data/editor.ts";
import {
  lexicalToTokens,
  tokensToLexical,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { initializeUsfmMarkerCatalog } from "@/core/domain/usfm/onionMarkers.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const PSALMS = readFileSync(
  path.resolve(
    dirname,
    "..",
    "..",
    "mockData",
    "berean-standard-bible",
    "19PSABSB.usfm",
  ),
  "utf8",
);

/** Slice one chapter's USFM out of the book (from its `\c N` to the next `\c`). */
function chapterUsfm(book: string, chapter: number): string {
  const start = book.indexOf(`\\c ${chapter}\n`);
  const next = book.indexOf(`\\c ${chapter + 1}\n`, start);
  if (start < 0) throw new Error(`chapter ${chapter} not found`);
  return `\\id PSA\n${book.slice(start, next < 0 ? undefined : next)}`;
}

async function buildState(
  chapter: number,
  // Repeats the chapter body to synthesize an extra-large chapter
  // (~2x Psalm 119) for the high end of the 2000-4000 token range.
  repeatBody = 1,
): Promise<{ state: SerializedEditorState; tokenCount: number }> {
  let usfm = chapterUsfm(PSALMS, chapter);
  if (repeatBody > 1) {
    const bodyStart = usfm.indexOf("\\v 1 ");
    usfm = usfm + usfm.slice(bodyStart).repeat(repeatBody - 1);
  }
  const { tokens } = await webUsfmOnionService.parseUsfm(usfm);
  return {
    state: tokensToLexical({
      tokens,
      direction: "ltr",
      mode: EDITOR_SHAPES.regular,
    }),
    tokenCount: tokens.length,
  };
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function bench(state: SerializedEditorState): {
  medianMs: number;
  p95Ms: number;
  tokens: number;
} {
  // Warm-up so JIT tiers settle before measurement.
  for (let i = 0; i < 10; i++) lexicalToTokens(state, { bookCode: "PSA" });
  const samples: number[] = [];
  let tokens = 0;
  for (let i = 0; i < 100; i++) {
    const t0 = performance.now();
    tokens = lexicalToTokens(state, { bookCode: "PSA" }).length;
    samples.push(performance.now() - t0);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    medianMs: median(samples),
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    tokens,
  };
}

// The regular-shape rebuild pairs marker+number tokens into numbered nodes
// via the catalog registry; initialize like the round-trip suite does.
beforeAll(async () => {
  initializeUsfmMarkerCatalog(await webUsfmOnionService.getMarkerCatalog());
});

describe("SPIKE S1: lexicalToTokens per-chapter cost", () => {
  it("benchmarks a small chapter (Psalm 117) and a large chapter (Psalm 119)", async () => {
    const small = await buildState(117);
    const large = await buildState(119);
    const xlarge = await buildState(119, 2);

    const smallResult = bench(small.state);
    const largeResult = bench(large.state);
    const xlargeResult = bench(xlarge.state);

    const report =
      `[S1] small (Psa 117): parsedTokens=${small.tokenCount} outTokens=${smallResult.tokens} ` +
      `median=${smallResult.medianMs.toFixed(3)}ms p95=${smallResult.p95Ms.toFixed(3)}ms\n` +
      `[S1] large (Psa 119): parsedTokens=${large.tokenCount} outTokens=${largeResult.tokens} ` +
      `median=${largeResult.medianMs.toFixed(3)}ms p95=${largeResult.p95Ms.toFixed(3)}ms\n` +
      `[S1] xlarge (Psa 119 x2 body): parsedTokens=${xlarge.tokenCount} outTokens=${xlargeResult.tokens} ` +
      `median=${xlargeResult.medianMs.toFixed(3)}ms p95=${xlargeResult.p95Ms.toFixed(3)}ms`;
    // eslint-disable-next-line no-console
    console.log(report);
    // The runner swallows console output; opt into a file dump when
    // collecting numbers: S1_SPIKE_OUT=/tmp/s1.txt pnpm exec vitest run ...
    if (process.env.S1_SPIKE_OUT) {
      writeFileSync(process.env.S1_SPIKE_OUT, `${report}\n`);
    }

    expect(largeResult.tokens).toBeGreaterThan(1000);
    expect(smallResult.tokens).toBeGreaterThan(10);
  });
});
