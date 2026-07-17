import type { AppliedProjection } from "./applyProjection.ts";
import { buildCompareSourcePair } from "./sourceDescriptors.ts";
import {
  COMPARE_SOURCE_KIND,
  type CompareSide,
  type CompareSourceDescriptor,
  type CompareSourcePair,
} from "./types.ts";

/**
 * Replace either physical side without giving Working a preferred position.
 * Selecting Working opposite Working displaces the old Working source with the
 * explicit Saved fallback so the pair keeps its one-writable-side invariant.
 */
export function replaceCompareSource(args: {
  activeSources: CompareSourcePair | null;
  side: CompareSide;
  descriptor: CompareSourceDescriptor;
  defaultLeft: CompareSourceDescriptor;
  defaultRight: CompareSourceDescriptor;
  savedFallback: CompareSourceDescriptor;
}): CompareSourcePair {
  let left = args.activeSources?.left ?? args.defaultLeft;
  let right = args.activeSources?.right ?? args.defaultRight;

  if (args.side === "left") left = args.descriptor;
  else right = args.descriptor;

  if (left.writable && right.writable) {
    if (args.side === "left") right = args.savedFallback;
    else left = args.savedFallback;
  }

  return buildCompareSourcePair({ left, right });
}

/** Read-only and Saved/Working review are inspection flows, not incoming work. */
export function requiresIncomingFlowGuard(sources: CompareSourcePair): boolean {
  if (sources.writableSide === null) return false;
  const other = sources.writableSide === "left" ? sources.right : sources.left;
  return other.locator.kind !== COMPARE_SOURCE_KIND.SAVED;
}

/** Persistence flags derived from the exact artifact committed to Working. */
export function buildApplySaveOptions(args: {
  sources: CompareSourcePair;
  applied: AppliedProjection;
}) {
  const other =
    args.sources.writableSide === "left"
      ? args.sources.right
      : args.sources.writableSide === "right"
        ? args.sources.left
        : null;
  return Object.freeze({
    reviewedRecoveredWork: other?.locator.kind === COMPARE_SOURCE_KIND.SAVED,
    deletedBookCodes: args.applied.deletedBookCodes,
    structurallyChangedBookCodes: args.applied.structurallyChangedBookCodes,
  });
}
