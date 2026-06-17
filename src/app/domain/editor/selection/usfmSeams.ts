import type { TextNode } from "lexical";

import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";

import type { SeamAffordance, SeamPredicate } from "./seamSelection.ts";

const tokenTypeOf = (node: TextNode): string | null =>
  $isUSFMTextNode(node) ? node.getTokenType() : null;

/**
 * Flat-mode (usfm/plain) seams around a verse/chapter number token: the
 * `marker → numberRange` boundary (`\v |3`) and the `numberRange → text`
 * boundary (`3| God`). Phrased as "exactly one side is a numberRange" so both
 * read from one rule and stay symmetric under RTL.
 */
export const isFlatNumberSeam: SeamPredicate = (left, right) => {
  const isNumber = (n: TextNode) =>
    tokenTypeOf(n) === UsfmTokenTypes.numberRange;
  return isNumber(left) !== isNumber(right);
};

/**
 * Affordance for flat number seams: tint the verse/chapter marker and the
 * number, never the prose. So `\v 3` tints both members of the marker/number
 * pairing, while the number/text pairing tints only the number side.
 */
export const flatNumberSeamAffordance: SeamAffordance = (node) => {
  const tt = tokenTypeOf(node);
  return tt === UsfmTokenTypes.marker || tt === UsfmTokenTypes.numberRange
    ? "tint"
    : null;
};
