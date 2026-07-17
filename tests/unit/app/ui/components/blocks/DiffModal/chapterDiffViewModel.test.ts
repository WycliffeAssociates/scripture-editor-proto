import { i18n } from "@lingui/core";
import { beforeAll, describe, expect, it } from "vitest";

import {
  shouldShowUnitSide,
  slotMoveNarration,
  tokensToReviewText,
  unitDetailLabels,
  unitPositionNarration,
} from "@/app/ui/components/blocks/DiffModal/chapterDiffViewModel.ts";
import type {
  DecisionUnit,
  DiffSkeleton,
  Token,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
});

const token = (overrides: Partial<Token>): Token => ({
  id: "token",
  kind: "text",
  source: "words",
  ...overrides,
});

const unit = (overrides: Partial<DecisionUnit> = {}): DecisionUnit => ({
  id: "move",
  kind: "coalesced",
  status: "moved",
  baselineSid: "GEN 1:1",
  currentSid: "GEN 1:1",
  baselineTokens: [token({ id: "left" })],
  currentTokens: [token({ id: "right" })],
  displaced: true,
  relabeled: false,
  dupContext: { baselineCount: 1, currentCount: 1 },
  isWhitespaceChange: false,
  isUsfmStructureChange: false,
  ...overrides,
});

describe("skeleton-native chapter review text", () => {
  it("keeps exact token source in USFM mode and hides structural tokens in reading mode", () => {
    const tokens: Token[] = [
      token({ id: "marker", kind: "marker", source: "\\v " }),
      token({ id: "number", kind: "number", source: "1 " }),
      token({ id: "text", source: "In the beginning" }),
      token({ id: "newline", kind: "newline", source: "\n" }),
    ];

    expect(tokensToReviewText({ tokens, showUsfmMarkers: true })).toBe(
      "\\v 1 In the beginning\n",
    );
    expect(tokensToReviewText({ tokens, showUsfmMarkers: false })).toBe(
      "In the beginning\n",
    );
  });

  it("narrates both positions of one moved decision", () => {
    const skeleton: DiffSkeleton = {
      units: [unit()],
      slots: [
        {
          unitId: "move",
          role: "pairCurrent",
          after: { unitId: "v3", sid: "GEN 1:3" },
        },
        {
          unitId: "move",
          role: "pairBaseline",
          after: { unitId: "v1", sid: "GEN 1:1" },
        },
      ],
    };

    expect(
      slotMoveNarration({ skeleton, slotIndex: 0, linkedSlotIndex: 1 }),
    ).toContain("was after GEN 1:1");
    expect(
      slotMoveNarration({ skeleton, slotIndex: 1, linkedSlotIndex: 0 }),
    ).toContain("now after GEN 1:3");
    expect(
      unitPositionNarration({
        skeleton,
        unit: skeleton.units[0]!,
        leftSlotIndex: 1,
        rightSlotIndex: 0,
      }),
    ).toContain("GEN 1:1 to after GEN 1:3");
    expect(
      shouldShowUnitSide({
        unit: skeleton.units[0]!,
        slot: skeleton.slots[0]!,
        side: "left",
      }),
    ).toBe(false);
  });

  it("surfaces relabel, coverage, duplicate, whitespace, and structure metadata", () => {
    const details = unitDetailLabels({
      unit: unit({
        relabeled: true,
        coveredBy: { unitId: "bridge", sid: "GEN 1:1-2", side: "current" },
        dupContext: { baselineCount: 2, currentCount: 3 },
        isWhitespaceChange: true,
        isUsfmStructureChange: true,
      }),
      leftLabel: "Saved",
      rightLabel: "Working",
    });

    expect(details.join(" ")).toContain("Whitespace only");
    expect(details.join(" ")).toContain("USFM structure only");
    expect(details.join(" ")).toContain("different reference label");
    expect(details.join(" ")).toContain("GEN 1:1-2 on Working");
    expect(details.join(" ")).toContain("2 on Saved, 3 on Working");
  });
});
