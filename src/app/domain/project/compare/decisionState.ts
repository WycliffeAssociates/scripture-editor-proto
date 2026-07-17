import type {
  DiffSkeleton,
  MergeRequest,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

import { shouldDefaultToWritableSide } from "./sourceDescriptors.ts";
import type {
  CompareDecision,
  CompareChapterDecisions,
  CompareDecisionMap,
  CompareDecisionsByBook,
  CompareResult,
  CompareSide,
  FrozenChapterComparison,
} from "./types.ts";

export type DecisionCompleteness = Readonly<{
  changed: number;
  decided: number;
  unresolved: number;
  complete: boolean;
}>;

export function isDecisionUnit(unit: DiffSkeleton["units"][number]): boolean {
  return unit.status !== "unchanged";
}

function changedUnitIds(skeleton: DiffSkeleton): string[] {
  return skeleton.units.filter(isDecisionUnit).map((unit) => unit.id);
}

function assertKnownChangedUnit(skeleton: DiffSkeleton, unitId: string): void {
  const unit = skeleton.units.find((candidate) => candidate.id === unitId);
  if (!unit) throw new Error(`Unknown compare unit id: ${unitId}`);
  if (!isDecisionUnit(unit)) {
    throw new Error(`Unit does not require a decision: ${unitId}`);
  }
}

function createInitialDecisionMap(args: {
  skeleton: DiffSkeleton;
  defaultSide: CompareSide | null;
}): CompareDecisionMap {
  const defaultSide = args.defaultSide;
  if (defaultSide === null) return Object.freeze({});
  return Object.freeze(
    Object.fromEntries(
      changedUnitIds(args.skeleton).map((unitId) => [unitId, defaultSide]),
    ),
  );
}

export function createInitialDecisions(
  result: CompareResult,
): CompareDecisionsByBook {
  const defaultSide = shouldDefaultToWritableSide(result.sources)
    ? result.sources.writableSide
    : null;
  const byBook: Record<string, Record<number, CompareChapterDecisions>> = {};
  for (const chapter of iterateChapters(result)) {
    (byBook[chapter.address.bookCode] ??= {})[chapter.address.chapterNum] =
      Object.freeze({
        units: createInitialDecisionMap({
          skeleton: chapter.skeleton,
          defaultSide,
        }),
        presence:
          requiresExplicitPresenceDecision(chapter) && defaultSide !== null
            ? defaultSide
            : null,
      });
  }
  return freezeDecisionTree(byBook);
}

export function requiresExplicitPresenceDecision(
  chapter: FrozenChapterComparison,
): boolean {
  return (
    chapter.left.present !== chapter.right.present &&
    changedUnitIds(chapter.skeleton).length === 0
  );
}

export function setChapterPresenceDecision(args: {
  chapter: FrozenChapterComparison;
  previous: CompareChapterDecisions;
  decision: CompareSide | null;
}): CompareChapterDecisions {
  if (!requiresExplicitPresenceDecision(args.chapter)) {
    throw new Error(
      "Chapter presence is already represented by Onion decision units.",
    );
  }
  return Object.freeze({ units: args.previous.units, presence: args.decision });
}

export function setUnitDecision(args: {
  previous: CompareDecisionMap;
  skeleton: DiffSkeleton;
  unitId: string;
  decision: CompareDecision;
}): CompareDecisionMap {
  assertKnownChangedUnit(args.skeleton, args.unitId);
  return Object.freeze({ ...args.previous, [args.unitId]: args.decision });
}

export function clearUnitDecision(args: {
  previous: CompareDecisionMap;
  skeleton: DiffSkeleton;
  unitId: string;
}): CompareDecisionMap {
  assertKnownChangedUnit(args.skeleton, args.unitId);
  const next = { ...args.previous };
  delete next[args.unitId];
  return Object.freeze(next);
}

/** Bulk stamping always addresses the underlying skeleton, never filtered rows. */
export function stampDecisionScope(args: {
  previous: CompareDecisionMap;
  skeleton: DiffSkeleton;
  decision: CompareDecision;
}): CompareDecisionMap {
  const next = { ...args.previous };
  for (const unitId of changedUnitIds(args.skeleton))
    next[unitId] = args.decision;
  return Object.freeze(next);
}

export function clearDecisionScope(args: {
  previous: CompareDecisionMap;
  skeleton: DiffSkeleton;
}): CompareDecisionMap {
  const next = { ...args.previous };
  for (const unitId of changedUnitIds(args.skeleton)) delete next[unitId];
  return Object.freeze(next);
}

export function decisionCompleteness(
  skeleton: DiffSkeleton,
  decisions: CompareDecisionMap,
): DecisionCompleteness {
  const ids = changedUnitIds(skeleton);
  const decided = ids.reduce(
    (count, unitId) => count + (decisions[unitId] === undefined ? 0 : 1),
    0,
  );
  return Object.freeze({
    changed: ids.length,
    decided,
    unresolved: ids.length - decided,
    complete: decided === ids.length,
  });
}

export function chapterDecisionCompleteness(
  chapter: FrozenChapterComparison,
  decisions: CompareChapterDecisions,
): DecisionCompleteness {
  const units = decisionCompleteness(chapter.skeleton, decisions.units);
  const presenceRequired = requiresExplicitPresenceDecision(chapter);
  const presenceDecided = !presenceRequired || decisions.presence !== null;
  return Object.freeze({
    changed: units.changed + (presenceRequired ? 1 : 0),
    decided: units.decided + (presenceRequired && presenceDecided ? 1 : 0),
    unresolved:
      units.unresolved + (presenceRequired && !presenceDecided ? 1 : 0),
    complete: units.complete && presenceDecided,
  });
}

export function toMergeRequest(args: {
  skeleton: DiffSkeleton;
  decisions: CompareDecisionMap;
  /** Side used for byte-equal/unchanged units, normally the writable side. */
  defaultSide?: CompareSide;
}): MergeRequest {
  for (const [unitId, decision] of Object.entries(args.decisions)) {
    assertKnownChangedUnit(args.skeleton, unitId);
    if (decision !== "left" && decision !== "right") {
      throw new Error(
        `Invalid decision for compare unit ${unitId}: ${decision}`,
      );
    }
  }
  const completeness = decisionCompleteness(args.skeleton, args.decisions);
  if (!completeness.complete) {
    throw new Error(
      `Cannot project unresolved comparison (${completeness.unresolved} remaining).`,
    );
  }

  const decisions = Object.fromEntries(
    changedUnitIds(args.skeleton).map((unitId) => [
      unitId,
      args.decisions[unitId] === "left" ? "baseline" : "current",
    ]),
  ) as MergeRequest["decisions"];
  return {
    decisions,
    defaultSide: args.defaultSide === "right" ? "current" : "baseline",
  };
}

export function decisionsForChapter(
  decisions: CompareDecisionsByBook,
  chapter: FrozenChapterComparison,
): CompareChapterDecisions {
  return (
    decisions[chapter.address.bookCode]?.[chapter.address.chapterNum] ??
    Object.freeze({ units: Object.freeze({}), presence: null })
  );
}

export function* iterateChapters(
  result: CompareResult,
): Generator<FrozenChapterComparison> {
  for (const bookCode of Object.keys(result.chapters).sort()) {
    const chapters = result.chapters[bookCode] ?? {};
    for (const chapterNum of Object.keys(chapters)
      .map(Number)
      .sort((a, b) => a - b)) {
      const chapter = chapters[chapterNum];
      if (chapter) yield chapter;
    }
  }
}

function freezeDecisionTree(
  tree: Record<string, Record<number, CompareChapterDecisions>>,
): CompareDecisionsByBook {
  for (const chapters of Object.values(tree)) Object.freeze(chapters);
  return Object.freeze(tree);
}
