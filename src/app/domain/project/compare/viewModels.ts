import type {
  DecisionUnit,
  DiffSkeleton,
  Slot,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

import type { CompareDecisionMap, CompareSide } from "./types.ts";

export type CompareListRow = Readonly<{
  unit: DecisionUnit;
  decision: CompareSide | null;
  leftSlotIndex: number | null;
  rightSlotIndex: number | null;
  /** Right/current document order when available; left order for deletions. */
  readOrder: number;
}>;

export type CompareChapterSlotRow = Readonly<{
  slot: Slot;
  slotIndex: number;
  side: CompareSide | "both";
  unit: DecisionUnit;
  decision: CompareSide | null;
  linkedSlotIndex: number | null;
}>;

export type CompareRowFilters = Readonly<{
  hideUnchanged?: boolean;
  hideWhitespaceOnly?: boolean;
  hideUsfmStructureOnly?: boolean;
  hideDecided?: boolean;
}>;

function slotSide(role: Slot["role"]): CompareSide | "both" {
  if (role === "shared") return "both";
  return role === "baselineOnly" || role === "pairBaseline" ? "left" : "right";
}

function slotIndexesByUnit(skeleton: DiffSkeleton): Map<string, number[]> {
  const result = new Map<string, number[]>();
  skeleton.slots.forEach((slot, index) => {
    const indexes = result.get(slot.unitId) ?? [];
    indexes.push(index);
    result.set(slot.unitId, indexes);
  });
  return result;
}

function visibleUnit(
  unit: DecisionUnit,
  decision: CompareSide | null,
  filters: CompareRowFilters,
): boolean {
  if (filters.hideUnchanged && unit.status === "unchanged" && !unit.relabeled) {
    return false;
  }
  if (filters.hideWhitespaceOnly && unit.isWhitespaceChange) return false;
  if (filters.hideUsfmStructureOnly && unit.isUsfmStructureChange) return false;
  if (filters.hideDecided && decision !== null) return false;
  return true;
}

/** One row per decision unit, even when a move occupies two skeleton slots. */
export function buildCompareListRows(args: {
  skeleton: DiffSkeleton;
  decisions: CompareDecisionMap;
  filters?: CompareRowFilters;
}): readonly CompareListRow[] {
  const indexesByUnit = slotIndexesByUnit(args.skeleton);
  const filters = args.filters ?? {};
  const rows = args.skeleton.units.flatMap((unit) => {
    const indexes = indexesByUnit.get(unit.id) ?? [];
    const leftSlotIndex = indexes.find(
      (index) =>
        slotSide(args.skeleton.slots[index]?.role ?? "shared") === "left",
    );
    const rightSlotIndex = indexes.find(
      (index) =>
        slotSide(args.skeleton.slots[index]?.role ?? "shared") === "right",
    );
    const sharedSlotIndex = indexes.find(
      (index) =>
        slotSide(args.skeleton.slots[index]?.role ?? "shared") === "both",
    );
    const decision = args.decisions[unit.id] ?? null;
    if (!visibleUnit(unit, decision, filters)) return [];
    return [
      Object.freeze({
        unit,
        decision,
        leftSlotIndex: leftSlotIndex ?? sharedSlotIndex ?? null,
        rightSlotIndex: rightSlotIndex ?? sharedSlotIndex ?? null,
        readOrder:
          rightSlotIndex ??
          sharedSlotIndex ??
          leftSlotIndex ??
          Number.MAX_SAFE_INTEGER,
      }),
    ];
  });
  rows.sort(
    (a, b) => a.readOrder - b.readOrder || a.unit.id.localeCompare(b.unit.id),
  );
  return Object.freeze(rows);
}

/** One row per canonical slot. Moved rows link back to the same unit decision. */
export function buildCompareChapterRows(args: {
  skeleton: DiffSkeleton;
  decisions: CompareDecisionMap;
  filters?: CompareRowFilters;
}): readonly CompareChapterSlotRow[] {
  const units = new Map(args.skeleton.units.map((unit) => [unit.id, unit]));
  const indexesByUnit = slotIndexesByUnit(args.skeleton);
  const filters = args.filters ?? {};
  return Object.freeze(
    args.skeleton.slots.flatMap((slot, slotIndex) => {
      const unit = units.get(slot.unitId);
      if (!unit)
        throw new Error(
          `Skeleton slot references unknown unit: ${slot.unitId}`,
        );
      const decision = args.decisions[unit.id] ?? null;
      if (!visibleUnit(unit, decision, filters)) return [];
      const linkedSlotIndex = unit.displaced
        ? ((indexesByUnit.get(unit.id) ?? []).find(
            (index) => index !== slotIndex,
          ) ?? null)
        : null;
      return [
        Object.freeze({
          slot,
          slotIndex,
          side: slotSide(slot.role),
          unit,
          decision,
          linkedSlotIndex,
        }),
      ];
    }),
  );
}

export function countHiddenUnresolved(args: {
  skeleton: DiffSkeleton;
  decisions: CompareDecisionMap;
  filters: CompareRowFilters;
}): number {
  return args.skeleton.units.reduce((count, unit) => {
    if (unit.status === "unchanged" || args.decisions[unit.id] !== undefined)
      return count;
    return visibleUnit(unit, null, args.filters) ? count : count + 1;
  }, 0);
}
