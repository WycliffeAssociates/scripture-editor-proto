import { describe, expect, it } from "vitest";

import {
  buildCompareChapterRows,
  buildCompareListRows,
  countHiddenUnresolved,
} from "@/app/domain/project/compare/viewModels.ts";
import type { DiffSkeleton, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

const token = (id: string): Token => ({
  id,
  kind: "text",
  sid: `GEN 1:${id}`,
  source: id,
});
const skeleton: DiffSkeleton = {
  slots: [
    {
      unitId: "move",
      role: "pairCurrent",
      after: { unitId: "shared", sid: "GEN 1:0" },
    },
    { unitId: "shared", role: "shared" },
    { unitId: "move", role: "pairBaseline" },
    { unitId: "ws", role: "currentOnly" },
  ],
  units: [
    {
      id: "shared",
      kind: "shared",
      status: "unchanged",
      baselineSid: "GEN 1:0",
      currentSid: "GEN 1:0",
      baselineTokens: [token("0")],
      currentTokens: [token("0")],
      displaced: false,
      relabeled: false,
      dupContext: { baselineCount: 1, currentCount: 1 },
      isWhitespaceChange: false,
      isUsfmStructureChange: false,
    },
    {
      id: "move",
      kind: "coalesced",
      status: "moved",
      baselineSid: "GEN 1:1",
      currentSid: "GEN 1:1",
      baselineTokens: [token("1")],
      currentTokens: [token("1")],
      displaced: true,
      relabeled: false,
      dupContext: { baselineCount: 1, currentCount: 1 },
      isWhitespaceChange: false,
      isUsfmStructureChange: false,
    },
    {
      id: "ws",
      kind: "added",
      status: "added",
      currentSid: "GEN 1:2",
      baselineTokens: [],
      currentTokens: [token("2")],
      displaced: false,
      relabeled: false,
      dupContext: { baselineCount: 0, currentCount: 1 },
      isWhitespaceChange: true,
      isUsfmStructureChange: false,
    },
  ],
};

describe("skeleton-native compare view models", () => {
  it("projects a moved pair once in list/current read order", () => {
    const rows = buildCompareListRows({
      skeleton,
      decisions: {},
      filters: { hideUnchanged: true },
    });
    expect(rows.map((row) => row.unit.id)).toEqual(["move", "ws"]);
    expect(rows[0]).toMatchObject({
      leftSlotIndex: 2,
      rightSlotIndex: 0,
      readOrder: 0,
    });
  });

  it("projects a moved pair as two linked chapter slots sharing one decision", () => {
    const rows = buildCompareChapterRows({
      skeleton,
      decisions: { move: "right" },
    });
    const moved = rows.filter((row) => row.unit.id === "move");
    expect(moved).toHaveLength(2);
    expect(moved.map((row) => row.linkedSlotIndex)).toEqual([2, 0]);
    expect(moved.every((row) => row.decision === "right")).toBe(true);
    expect(moved[0]?.slot.after).toEqual({ unitId: "shared", sid: "GEN 1:0" });
  });

  it("reports unresolved units hidden by render-only filters", () => {
    expect(
      countHiddenUnresolved({
        skeleton,
        decisions: {},
        filters: { hideWhitespaceOnly: true },
      }),
    ).toBe(1);
  });
});
