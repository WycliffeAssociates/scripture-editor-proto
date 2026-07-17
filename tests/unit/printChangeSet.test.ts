import { describe, expect, it, vi } from "vitest";

import { buildCompareSourcePair } from "@/app/domain/project/compare/sourceDescriptors.ts";
import type { CompareSourceDescriptor } from "@/app/domain/project/compare/types.ts";
import { buildPrintChangeSet } from "@/app/domain/project/print/buildPrintChangeSet.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type {
  DecisionUnit,
  DiffSkeleton,
  Token,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

function token(
  id: string,
  source: string,
  kind: Token["kind"] = "text",
): Token {
  return { id, kind, source, sid: "GEN 1:1" };
}

function unit(
  args: Partial<DecisionUnit> & Pick<DecisionUnit, "id" | "status">,
): DecisionUnit {
  return {
    kind: "coalesced",
    baselineSid: "GEN 1:1",
    currentSid: "GEN 1:1",
    baselineTokens: [],
    currentTokens: [],
    displaced: false,
    relabeled: false,
    dupContext: { baselineCount: 1, currentCount: 1 },
    isWhitespaceChange: false,
    isUsfmStructureChange: false,
    ...args,
  };
}

function files(): ScriptureBookState[] {
  const tokens = [token("raw", "raw")];
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
          dirty: false,
          direction: "ltr",
          eol: "\n",
          sourceTokens: tokens,
          currentTokens: tokens,
        },
      ],
    },
  ];
}

function descriptor(id: string, writable = false): CompareSourceDescriptor {
  return {
    id,
    label: id,
    writable,
    locator:
      id === "old"
        ? { kind: "previousVersion", projectId: "p1", oid: "old" }
        : { kind: "working", projectId: "p1" },
    reload: async () => ({ files: files() }),
  };
}

function service(skeleton: DiffSkeleton): IUsfmOnionService {
  return {
    diffScope: vi.fn(async () => [skeleton]),
  } as unknown as IUsfmOnionService;
}

describe("buildPrintChangeSet", () => {
  it("prints skeleton units once in current/read order and merges verse chunks", async () => {
    const moved = unit({
      id: "move",
      status: "moved",
      displaced: true,
      baselineTokens: [token("move-old", "same")],
      currentTokens: [token("move-new", "same")],
    });
    const modified = unit({
      id: "modify",
      status: "modified",
      baselineTokens: [
        token("old-marker", "\\v", "marker"),
        token("old", " old words"),
      ],
      currentTokens: [
        token("new-marker", "\\v", "marker"),
        token("new", " new words"),
      ],
    });
    const skeleton: DiffSkeleton = {
      // A move occupies two slots but remains one printed decision unit. Its
      // right slot also places it after the modified unit in read order.
      slots: [
        { unitId: "move", role: "pairBaseline" },
        { unitId: "modify", role: "pairBaseline" },
        { unitId: "modify", role: "pairCurrent" },
        { unitId: "move", role: "pairCurrent" },
      ],
      units: [moved, modified],
    };

    const result = await buildPrintChangeSet({
      oldFiles: files(),
      newFiles: files(),
      sources: buildCompareSourcePair({
        left: descriptor("old"),
        right: descriptor("new"),
      }),
      usfmOnionService: service(skeleton),
      scope: { kind: "all" },
      granularity: "verses",
      includeUsfm: false,
    });

    expect(result.totalChanges).toBe(1);
    expect(result.books[0]?.chapters[0]?.entries).toEqual([
      {
        semanticSid: "GEN 1:1",
        status: "modified",
        oldRuns: [
          { text: "old", mark: "removed" },
          { text: " words", mark: "unchanged" },
          { text: " ", mark: "unchanged" },
          { text: "same", mark: "unchanged" },
        ],
        newRuns: [
          { text: "new", mark: "added" },
          { text: " words", mark: "unchanged" },
          { text: " ", mark: "unchanged" },
          { text: "same", mark: "unchanged" },
        ],
      },
    ]);
  });

  it("includes raw marker tokens only when USFM output is requested", async () => {
    const skeleton: DiffSkeleton = {
      slots: [{ unitId: "add", role: "currentOnly" }],
      units: [
        unit({
          id: "add",
          kind: "added",
          status: "added",
          baselineSid: undefined,
          currentTokens: [
            token("marker", "\\p", "marker"),
            token("text", " added"),
          ],
        }),
      ],
    };

    const result = await buildPrintChangeSet({
      oldFiles: files(),
      newFiles: files(),
      sources: buildCompareSourcePair({
        left: descriptor("old"),
        right: descriptor("new"),
      }),
      usfmOnionService: service(skeleton),
      scope: { kind: "books", bookCodes: ["GEN"] },
      granularity: "chunks",
      includeUsfm: true,
    });

    expect(result.books[0]?.chapters[0]?.entries[0]).toMatchObject({
      status: "added",
      oldRuns: [],
      newRuns: [{ text: "\\p added", mark: "added" }],
    });
  });

  it("rejects a writable compare pair instead of hiding print source semantics", async () => {
    await expect(
      buildPrintChangeSet({
        oldFiles: files(),
        newFiles: files(),
        sources: buildCompareSourcePair({
          left: descriptor("old"),
          right: descriptor("new", true),
        }),
        usfmOnionService: service({ slots: [], units: [] }),
        scope: { kind: "all" },
        granularity: "chunks",
        includeUsfm: false,
      }),
    ).rejects.toThrow("two read-only sources");
  });
});
