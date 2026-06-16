// Store-seam contracts for the unified FindingsStore (findings plan §10):
// namespace isolation, structural supersession, chapter-0 bucketing (the
// falsy-zero regression), and path-copy reference behavior — the invalidation
// contract every `useSyncExternalStore` consumer leans on.

import { describe, expect, it } from "vitest";

import type { Finding } from "@/app/domain/editor/annotations/finding.ts";
import {
  groupFindingsByChapter,
  lintIssuesToFindings,
  onionFindingsByChapter,
  sousFindingsToFindings,
} from "@/app/domain/editor/annotations/normalizeFindings.ts";
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

function sousFinding(sid: string): Finding {
  return sousFindingsToFindings([
    {
      sid,
      code: "lex.excess-h-whitespace",
      severity: "warning",
      start: 0,
      end: 2,
    },
  ])[0];
}

describe("FindingsStore", () => {
  it("namespace isolation: interleaved onion/sous commits for ONE book never touch each other's slice", () => {
    const store = new FindingsStore();

    store.commitBookFindings(
      "onion",
      "GEN",
      onionFindingsByChapter([makeIssue()]),
    );
    const afterOnion = store.read();

    store.commitSousBookFindings(
      "GEN",
      groupFindingsByChapter([sousFinding("GEN 1:1")]),
      { "GEN 1:1": [] },
    );
    const afterSous = store.read();

    // The sous commit replaced the root and its own slice — but the onion
    // slice (and its GEN node) kept their references.
    expect(afterSous).not.toBe(afterOnion);
    expect(afterSous.onion).toBe(afterOnion.onion);
    expect(store.chapterFindings("onion", "GEN", 1)).toHaveLength(1);
    expect(store.chapterFindings("sous-chef", "GEN", 1)).toHaveLength(1);

    // And an onion supersession leaves sous untouched.
    store.commitBookFindings("onion", "GEN", {});
    expect(store.chapterFindings("onion", "GEN", 1)).toHaveLength(0);
    expect(store.chapterFindings("sous-chef", "GEN", 1)).toHaveLength(1);
    expect(store.read()["sous-chef"]).toBe(afterSous["sous-chef"]);
  });

  it("structural supersession: a clean pass commits {} and the book's findings are gone — no merge rule to forget", () => {
    const store = new FindingsStore();
    store.commitBookFindings(
      "onion",
      "GEN",
      onionFindingsByChapter([
        makeIssue({ sid: "GEN 1:1" }),
        makeIssue({ sid: "GEN 2:3", tokenId: "n2" }),
      ]),
    );
    expect(store.chapterFindings("onion", "GEN", 1)).toHaveLength(1);
    expect(store.chapterFindings("onion", "GEN", 2)).toHaveLength(1);

    store.commitBookFindings("onion", "GEN", {});
    expect(store.read().onion?.byBook.GEN).toEqual({});
  });

  it("chapter 0 is an address: front-matter findings land in bucket 0 and survive (the falsy-zero regression)", () => {
    // `\h`-land issue: sid parses to chapter 0. The old LintStore grouping
    // did `if (!chapter) continue;` and dropped these on the floor.
    const frontMatter = makeIssue({ sid: "GEN 0:0", tokenId: "h1" });
    // No sid at all → also the front-matter bucket of the pass's book.
    const noSid = makeIssue({ sid: undefined, tokenId: "h2" });

    const byChapter = onionFindingsByChapter([
      frontMatter,
      noSid,
      makeIssue({ sid: "GEN 1:1" }),
    ]);
    expect(byChapter[0]).toHaveLength(2);
    expect(byChapter[1]).toHaveLength(1);

    const store = new FindingsStore();
    store.commitBookFindings("onion", "GEN", byChapter);
    expect(store.chapterFindings("onion", "GEN", 0)).toHaveLength(2);
  });

  it("path-copy: a commit to one book keeps every untouched sibling's reference (the memo-skip contract)", () => {
    const store = new FindingsStore();
    store.commitBookFindings(
      "onion",
      "GEN",
      onionFindingsByChapter([makeIssue()]),
    );
    store.commitBookFindings(
      "onion",
      "EXO",
      onionFindingsByChapter([makeIssue({ sid: "EXO 1:1", tokenId: "x1" })]),
    );
    const before = store.read();
    const genBefore = before.onion?.byBook.GEN;

    store.commitBookFindings(
      "onion",
      "EXO",
      onionFindingsByChapter([makeIssue({ sid: "EXO 2:1", tokenId: "x2" })]),
    );
    const after = store.read();

    expect(after).not.toBe(before);
    expect(after.onion).not.toBe(before.onion);
    expect(after.onion?.byBook.EXO).not.toBe(before.onion?.byBook.EXO);
    // GEN node untouched → identical reference; selector-keyed memos skip.
    expect(after.onion?.byBook.GEN).toBe(genBefore);
  });

  it("normalizes book keys to upper case on commit and read", () => {
    const store = new FindingsStore();
    store.commitBookFindings(
      "onion",
      "gen",
      onionFindingsByChapter([makeIssue()]),
    );
    expect(store.chapterFindings("onion", "Gen", 1)).toHaveLength(1);
  });

  it("getSnapshot returns the cached root between commits (useSyncExternalStore contract)", () => {
    const store = new FindingsStore();
    store.commitBookFindings(
      "onion",
      "GEN",
      groupFindingsByChapter(lintIssuesToFindings([makeIssue()])),
    );
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
});
