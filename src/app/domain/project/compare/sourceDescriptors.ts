import {
  COMPARE_SOURCE_KIND,
  type CompareSide,
  type CompareSourceDescriptor,
  type CompareSourcePair,
} from "./types.ts";

export function buildCompareSourcePair(args: {
  left: CompareSourceDescriptor;
  right: CompareSourceDescriptor;
}): CompareSourcePair {
  const writableSides: CompareSide[] = [];
  if (args.left.writable) writableSides.push("left");
  if (args.right.writable) writableSides.push("right");

  if (writableSides.length > 1) {
    throw new Error("A comparison may have at most one writable side.");
  }
  for (const descriptor of [args.left, args.right]) {
    if (
      descriptor.writable &&
      descriptor.locator.kind !== COMPARE_SOURCE_KIND.WORKING
    ) {
      throw new Error("Only a working-copy source may be writable.");
    }
  }

  return Object.freeze({
    left: args.left,
    right: args.right,
    writableSide: writableSides[0] ?? null,
  });
}

/** Unsaved review is the only flow that starts with every change decided. */
export function shouldDefaultToWritableSide(
  sources: CompareSourcePair,
): boolean {
  if (sources.writableSide === null) return false;
  const other = sources.writableSide === "left" ? sources.right : sources.left;
  return other.locator.kind === COMPARE_SOURCE_KIND.SAVED;
}
