import {
  mutAddSids,
  type TokenForSidCalculation,
} from "@/core/domain/usfm/parseUtils.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

function toSidCalculationToken(token: Token): TokenForSidCalculation {
  return {
    tokenType:
      token.kind === "marker"
        ? "marker"
        : token.kind === "endMarker"
          ? "endMarker"
          : token.kind === "number"
            ? "numberRange"
            : token.kind === "newline"
              ? "nl"
              : token.kind,
    text: token.source,
    marker: token.marker,
    sid: token.sid,
    numberInfo: token.numberInfo,
  };
}

/**
 * App-level SID normalization for stored token streams.
 *
 * Upstream parsing can leave some intro/document marker tokens without a SID,
 * especially around `\\id`. Once Zephyr owns a token array, we normalize SIDs
 * so diffing, history, and rendering can rely on one consistent invariant:
 * chapter-0 material is anchored to `BOOK 0:0`.
 */
export function normalizeTokenSids(tokens: Token[], bookCode: string): Token[] {
  if (!tokens.length) return [];

  const normalized = structuredClone(tokens);
  const sidTokens = normalized.map(toSidCalculationToken);
  mutAddSids(sidTokens, bookCode);

  return normalized.map((token, index) => ({
    ...token,
    sid: sidTokens[index]?.sid ?? token.sid,
  }));
}
