import { describe, expect, it, vi } from "vitest";

import { buildCompareResultAsync } from "@/app/domain/project/compare/compareService.ts";
import { buildCompareSourcePair } from "@/app/domain/project/compare/sourceDescriptors.ts";
import type { CompareSourceDescriptor } from "@/app/domain/project/compare/types.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type {
  DiffScopeItem,
  DiffSkeleton,
  Token,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

function source(
  kind: "saved" | "working" | "existingProject",
  writable = false,
): CompareSourceDescriptor {
  return {
    id: kind,
    label: kind,
    writable,
    locator: { kind, projectId: "p1" },
    reload: async () => ({ files: [] }),
  };
}

function files(
  tokens: Token[],
  eol: "\n" | "\r\n" = "\n",
  dirty = false,
): ScriptureBookState[] {
  return [
    {
      path: "/GEN.usfm",
      title: "Genesis",
      bookCode: "GEN",
      nextBookId: null,
      prevBookId: null,
      chapters: [
        {
          chapterNumber: 1,
          dirty,
          direction: "ltr",
          eol,
          sourceTokens: tokens,
          currentTokens: tokens,
        },
      ],
    },
  ];
}

function skeleton(
  left: readonly Token[],
  right: readonly Token[],
): DiffSkeleton {
  return {
    slots: [
      { unitId: "GEN 1:1", role: "pairBaseline" },
      { unitId: "GEN 1:1", role: "pairCurrent" },
    ],
    units: [
      {
        id: "GEN 1:1",
        kind: "coalesced",
        status: "modified",
        baselineSid: "GEN 1:1",
        currentSid: "GEN 1:1",
        baselineTokens: [...left],
        currentTokens: [...right],
        displaced: false,
        relabeled: false,
        dupContext: { baselineCount: 1, currentCount: 1 },
        isWhitespaceChange: false,
        isUsfmStructureChange: false,
      },
    ],
  };
}

describe("frozen symmetric compare snapshot", () => {
  it("normalizes and freezes complete chapter arrays before diffing", async () => {
    const rawLeft: Token[] = [
      { id: "c", kind: "marker", marker: "c", sid: "wrong", source: "\\c" },
      {
        id: "cn",
        kind: "number",
        sid: "wrong",
        source: " 1",
        numberInfo: { start: 1, kind: "single" },
      },
      { id: "v", kind: "marker", marker: "v", sid: "wrong", source: "\\v" },
      {
        id: "vn",
        kind: "number",
        sid: "wrong",
        source: " 1",
        numberInfo: { start: 1, kind: "single" },
      },
      { id: "t", kind: "text", sid: "wrong", source: " left" },
    ];
    const rawRight = rawLeft.map((token) => ({
      ...token,
      id: `r-${token.id}`,
    }));
    const seen: Array<{ left: readonly Token[]; right: readonly Token[] }> = [];
    const service = {
      async diffScope(
        scope: Array<{
          baselineTokens: readonly Token[];
          currentTokens: readonly Token[];
        }>,
      ) {
        return scope.map(({ baselineTokens, currentTokens }) => {
          seen.push({ left: baselineTokens, right: currentTokens });
          expect(Object.isFrozen(baselineTokens)).toBe(true);
          expect(Object.isFrozen(currentTokens)).toBe(true);
          return skeleton(baselineTokens, currentTokens);
        });
      },
    } as IUsfmOnionService;

    const result = await buildCompareResultAsync({
      leftFiles: files(rawLeft, "\r\n", true),
      rightFiles: files(rawRight, "\n", true),
      sources: buildCompareSourcePair({
        left: source("saved"),
        right: source("working", true),
      }),
      usfmOnionService: service,
    });

    const chapter = result.chapters.GEN?.[1];
    expect(chapter).toBeDefined();
    expect(chapter?.left.tokens).toBe(seen[0]?.left);
    expect(chapter?.right.tokens).toBe(seen[0]?.right);
    expect(chapter?.left.tokens.map((token) => token.sid)).toEqual([
      "GEN 1:0",
      "GEN 1:0",
      "GEN 1:1",
      "GEN 1:1",
      "GEN 1:1",
    ]);
    expect(chapter?.left.eol).toBe("\r\n");
    expect(rawLeft[0]?.sid).toBe("wrong");
  });

  it("diffs only dirty chapters for Saved-vs-Working review", async () => {
    const cleanToken: Token = {
      id: "clean",
      kind: "text",
      sid: "GEN 1:1",
      source: "clean",
    };
    const dirtyToken: Token = {
      id: "dirty",
      kind: "text",
      sid: "GEN 2:1",
      source: "dirty",
    };
    const saved = files([cleanToken]);
    const working = files([cleanToken]);
    saved[0]!.chapters.push({
      ...saved[0]!.chapters[0]!,
      chapterNumber: 2,
      sourceTokens: [cleanToken],
      currentTokens: [cleanToken],
    });
    working[0]!.chapters.push({
      ...working[0]!.chapters[0]!,
      chapterNumber: 2,
      dirty: true,
      sourceTokens: [cleanToken],
      currentTokens: [dirtyToken],
    });
    const diffScope = vi.fn(async (_scope: DiffScopeItem[]) => [
      skeleton([cleanToken], [dirtyToken]),
    ]);

    const result = await buildCompareResultAsync({
      leftFiles: saved,
      rightFiles: working,
      sources: buildCompareSourcePair({
        left: source("saved"),
        right: source("working", true),
      }),
      usfmOnionService: { diffScope } as unknown as IUsfmOnionService,
    });

    expect(diffScope).toHaveBeenCalledTimes(1);
    expect(diffScope.mock.calls[0]?.[0]).toHaveLength(1);
    expect(result.chapters.GEN?.[1]).toBeUndefined();
    expect(result.chapters.GEN?.[2]).toBeDefined();
  });

  it("retains one-sided chapter presence and coverage", async () => {
    const token: Token = { id: "t", kind: "text", sid: "GEN 1:1", source: "x" };
    const service = {
      diffScope: vi.fn(
        async (
          scope: Array<{
            baselineTokens: readonly Token[];
            currentTokens: readonly Token[];
          }>,
        ) =>
          scope.map(({ baselineTokens, currentTokens }) =>
            skeleton(baselineTokens, currentTokens),
          ),
      ),
    } as unknown as IUsfmOnionService;

    const result = await buildCompareResultAsync({
      leftFiles: files([token]),
      rightFiles: [],
      sources: buildCompareSourcePair({
        left: source("working", true),
        right: source("existingProject"),
      }),
      usfmOnionService: service,
    });

    expect(result.chapters.GEN?.[1]?.left.present).toBe(true);
    expect(result.chapters.GEN?.[1]?.right).toMatchObject({
      present: false,
      dirty: false,
      eol: null,
      direction: null,
      book: null,
      tokens: [],
    });
    expect(result.coverage.leftOnly).toEqual([
      { bookCode: "GEN", chapterNum: 1 },
    ]);
    expect(result.warnings.map((warning) => warning.code)).toContain(
      "book_coverage_diff",
    );
  });

  it("creates an app-level decision for empty-present versus absent coverage", async () => {
    const service = {
      diffScope: async () => [{ slots: [], units: [] }],
    } as unknown as IUsfmOnionService;

    const result = await buildCompareResultAsync({
      leftFiles: files([]),
      rightFiles: [],
      sources: buildCompareSourcePair({
        left: source("working", true),
        right: source("existingProject"),
      }),
      usfmOnionService: service,
    });

    expect(result.chapters.GEN?.[1]).toMatchObject({
      left: { present: true, tokens: [] },
      right: { present: false, tokens: [] },
    });
    expect(result.changedUnitCount).toBe(1);
  });
});
