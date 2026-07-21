import { t } from "@lingui/core/macro";

import type {
  DecisionUnit,
  DiffSkeleton,
  Slot,
  Token,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

const CONTENT_TOKEN_KINDS = new Set<Token["kind"]>([
  "text",
  "newline",
  "optBreak",
]);

export function tokensToReviewText(args: {
  tokens: readonly Token[];
  showUsfmMarkers: boolean;
}): string {
  return args.tokens
    .filter(
      (token) => args.showUsfmMarkers || CONTENT_TOKEN_KINDS.has(token.kind),
    )
    .map((token) => token.source)
    .join("");
}

export function unitReference(unit: DecisionUnit): string {
  return unit.currentSid ?? unit.baselineSid ?? unit.id;
}

function anchorReference(slot?: Slot): string {
  return slot?.after?.sid ?? t`the start of the chapter`;
}

export function unitStatusLabel(unit: DecisionUnit): string {
  switch (unit.status) {
    case "added":
      return t`Added`;
    case "deleted":
      return t`Removed`;
    case "modified":
      return unit.displaced ? t`Modified · moved` : t`Changed`;
    case "moved":
      return t`Moved`;
    case "unchanged":
      return unit.relabeled ? t`Reference relabeled` : t`Unchanged`;
  }
}

export type UnitStatusVariant =
  | "added"
  | "deleted"
  | "modified"
  | "moved"
  | "unchanged";

/** Badge color variant, independent of the exact label copy above. */
export function unitStatusVariant(unit: DecisionUnit): UnitStatusVariant {
  if (unit.status === "modified" && unit.displaced) return "moved";
  return unit.status;
}

export function unitDetailLabels(args: {
  unit: DecisionUnit;
  leftLabel: string;
  rightLabel: string;
}): readonly string[] {
  const { unit } = args;
  const details: string[] = [];

  if (unit.isWhitespaceChange) details.push(t`Whitespace only`);
  if (unit.isUsfmStructureChange) details.push(t`USFM structure only`);
  if (unit.relabeled) details.push(t`Same content, different reference label`);
  if (unit.coveredBy) {
    const coveringLabel =
      unit.coveredBy.side === "baseline" ? args.leftLabel : args.rightLabel;
    details.push(t`Covered by ${unit.coveredBy.sid} on ${coveringLabel}`);
  }
  if (unit.dupContext.baselineCount > 1 || unit.dupContext.currentCount > 1) {
    details.push(
      t`Duplicate context: ${unit.dupContext.baselineCount} on ${args.leftLabel}, ${unit.dupContext.currentCount} on ${args.rightLabel}`,
    );
  }

  return details;
}

export function slotMoveNarration(args: {
  skeleton: DiffSkeleton;
  slotIndex: number;
  linkedSlotIndex: number | null;
}): string | null {
  const slot = args.skeleton.slots[args.slotIndex];
  if (!slot || args.linkedSlotIndex === null) return null;
  const linked = args.skeleton.slots[args.linkedSlotIndex];
  if (!linked) return null;

  if (slot.role === "pairBaseline") {
    return t`Moved from here; now after ${anchorReference(linked)}`;
  }
  if (slot.role === "pairCurrent") {
    return t`Moved here; was after ${anchorReference(linked)}`;
  }
  return null;
}

/** Split anchor captions for the moved/collocated card: one short phrase per
 * column instead of `unitPositionNarration`'s single combined sentence. */
export function movedAnchorCaptions(args: {
  skeleton: DiffSkeleton;
  leftSlotIndex: number | null;
  rightSlotIndex: number | null;
}): { from: string; to: string } | null {
  const leftSlot =
    args.leftSlotIndex === null
      ? undefined
      : args.skeleton.slots[args.leftSlotIndex];
  const rightSlot =
    args.rightSlotIndex === null
      ? undefined
      : args.skeleton.slots[args.rightSlotIndex];
  if (!leftSlot || !rightSlot) return null;
  return {
    from: t`was after ${anchorReference(leftSlot)}`,
    to: t`now after ${anchorReference(rightSlot)}`,
  };
}

export function unitPositionNarration(args: {
  skeleton: DiffSkeleton;
  unit: DecisionUnit;
  leftSlotIndex: number | null;
  rightSlotIndex: number | null;
}): string | null {
  const leftSlot =
    args.leftSlotIndex === null
      ? undefined
      : args.skeleton.slots[args.leftSlotIndex];
  const rightSlot =
    args.rightSlotIndex === null
      ? undefined
      : args.skeleton.slots[args.rightSlotIndex];
  if (args.unit.displaced && leftSlot && rightSlot) {
    return t`Moved from after ${anchorReference(leftSlot)} to after ${anchorReference(rightSlot)}`;
  }
  if (args.unit.status === "added" && rightSlot) {
    return t`Added after ${anchorReference(rightSlot)}`;
  }
  if (args.unit.status === "deleted" && leftSlot) {
    return t`Removed after ${anchorReference(leftSlot)}`;
  }
  return null;
}

export function shouldShowUnitSide(args: {
  unit: DecisionUnit;
  slot: Slot;
  side: "left" | "right";
}): boolean {
  if (!args.unit.displaced) return true;
  if (args.slot.role === "pairBaseline") return args.side === "left";
  if (args.slot.role === "pairCurrent") return args.side === "right";
  return true;
}
