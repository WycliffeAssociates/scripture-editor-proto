// usfmTokenBuilders.ts
//
// Shared test-token factories for tests that need to construct
// SerializedLexicalNode-shaped USFM trees. Centralized so tests read
// as `describe`/`it` first rather than 30 lines of helper boilerplate
// at the top of each file.
//
// The factories use `createSerializedUSFMTextNode` so they stay in
// sync with the production node shape — if a field is added to
// `SerializedUSFMTextNode`, the factory updates and all tests inherit
// the change.

import type { SerializedLexicalNode } from "lexical";

import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";

/** Paragraph-class or any other USFM marker (e.g. `\p`, `\v`, `\q1`). */
export function tokenMarker(
  marker: string,
  sid = "GEN 1:1",
): SerializedLexicalNode {
  return createSerializedUSFMTextNode({
    text: `\\${marker} `,
    id: `${marker}-id`,
    sid,
    marker,
    tokenType: UsfmTokenTypes.marker,
  });
}

/** Number-range token (the "1" in `\v 1`). */
export function tokenNumberRange(
  text: string,
  sid = "GEN 1:1",
): SerializedLexicalNode {
  return createSerializedUSFMTextNode({
    text,
    id: `${sid}-number`,
    sid,
    tokenType: UsfmTokenTypes.numberRange,
  });
}

/** Plain text token. */
export function tokenText(
  textContent: string,
  sid = "GEN 1:1",
): SerializedLexicalNode {
  return createSerializedUSFMTextNode({
    text: textContent,
    id: `${sid}-${textContent}`,
    sid,
    tokenType: UsfmTokenTypes.text,
  });
}

/** Collapse a token list down to its text (with linebreaks as "\n"). */
export function tokenTexts(tokens: SerializedLexicalNode[]): string[] {
  return tokens.map((token) =>
    token.type === "linebreak"
      ? "\n"
      : "text" in token
        ? (token as { text: string }).text
        : "",
  );
}
