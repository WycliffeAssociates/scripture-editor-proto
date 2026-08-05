import type { SerializedLexicalNode } from "lexical";

import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
  createSerializedUSFMTextNode,
  isSerializedUSFMTextNode,
  type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

/**
 * Parsed card model for chapter-0 frontmatter. The decorator UI edits this
 * shape, then converts it back into flat serialized tokens for the rest of the
 * editor pipeline.
 */
export type BookFrontmatterEntry =
  | {
      kind: "id";
      marker: "id";
      id: string;
      markerSid: string;
      sid: string;
      code: string;
      content: string;
      hiddenTrailingTokens: SerializedLexicalNode[];
      tokens: SerializedLexicalNode[];
    }
  | {
      kind: "ide";
      marker: "ide";
      id: string;
      sid: string;
      encoding: string;
      hiddenTrailingTokens: SerializedLexicalNode[];
      tokens: SerializedLexicalNode[];
    }
  | {
      kind: "generic";
      marker: string;
      id: string;
      sid: string;
      value: string;
      hiddenTrailingTokens: SerializedLexicalNode[];
      tokens: SerializedLexicalNode[];
    };

function isLinebreakNode(
  node: SerializedLexicalNode,
): node is SerializedLexicalNode & { type: "linebreak" } {
  return node.type === "linebreak";
}

function isMarkerNode(
  node: SerializedLexicalNode,
): node is SerializedUSFMTextNode {
  return (
    isSerializedUSFMTextNode(node) &&
    node.tokenType === UsfmTokenTypes.marker &&
    typeof node.marker === "string"
  );
}

function nodeText(node: SerializedLexicalNode): string {
  if (isLinebreakNode(node)) return "\n";
  if (isSerializedUSFMTextNode(node)) return node.text ?? "";
  return "";
}

function joinValueTokens(tokens: SerializedLexicalNode[]): string {
  return tokens.map(nodeText).join("").replace(/^\s+/u, "");
}

function splitEntryChunks(
  tokens: SerializedLexicalNode[],
): SerializedLexicalNode[][] {
  const chunks: SerializedLexicalNode[][] = [];
  let current: SerializedLexicalNode[] = [];

  for (const token of tokens) {
    if (isMarkerNode(token) && current.length > 0) {
      chunks.push(current);
      current = [token];
      continue;
    }

    current.push(token);
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function parseIdValue(value: string): { code: string; content: string } {
  const trimmed = value.trim();
  if (!trimmed) return { code: "", content: "" };

  const [code = "", ...rest] = trimmed.split(/\s+/u);
  return {
    code,
    content: rest.join(" "),
  };
}

function findFirstNonEmptySid(tokens: SerializedLexicalNode[]): string {
  for (const token of tokens) {
    if (!isSerializedUSFMTextNode(token)) continue;
    if ((token.sid ?? "").trim().length > 0) {
      return token.sid ?? "";
    }
  }
  return "";
}

function splitTrailingLinebreakTokens(tokens: SerializedLexicalNode[]): {
  contentTokens: SerializedLexicalNode[];
  hiddenTrailingTokens: SerializedLexicalNode[];
} {
  let trailingStart = tokens.length;

  for (let index = tokens.length - 1; index >= 0; index--) {
    if (!isLinebreakNode(tokens[index] as SerializedLexicalNode)) {
      break;
    }
    trailingStart = index;
  }

  if (trailingStart === tokens.length) {
    return { contentTokens: tokens, hiddenTrailingTokens: [] };
  }

  const trailingLinebreaks = tokens.slice(trailingStart);
  if (trailingLinebreaks.length <= 1) {
    return { contentTokens: tokens, hiddenTrailingTokens: [] };
  }

  return {
    contentTokens: tokens.slice(0, trailingStart + 1),
    hiddenTrailingTokens: trailingLinebreaks.slice(1),
  };
}

export function parseBookFrontmatterEntries(
  tokens: SerializedLexicalNode[],
): BookFrontmatterEntry[] {
  return splitEntryChunks(tokens)
    .map((chunk) => {
      const first = chunk[0];
      if (!first || !isMarkerNode(first)) return null;
      const { contentTokens, hiddenTrailingTokens } =
        splitTrailingLinebreakTokens(chunk);

      const marker = first.marker ?? "";
      const sid = first.sid ?? "";
      const value = joinValueTokens(contentTokens.slice(1)).replace(
        /\n+$/u,
        "",
      );
      const id = first.id ?? guidGenerator();

      if (marker === "id") {
        const parsed = parseIdValue(value);
        return {
          kind: "id",
          marker: "id",
          id,
          markerSid: sid,
          sid: findFirstNonEmptySid(contentTokens.slice(1)) || sid,
          code: parsed.code,
          content: parsed.content,
          hiddenTrailingTokens,
          tokens: chunk,
        } satisfies BookFrontmatterEntry;
      }

      if (marker === "ide") {
        return {
          kind: "ide",
          marker: "ide",
          id,
          sid,
          encoding: value.trim(),
          hiddenTrailingTokens,
          tokens: chunk,
        } satisfies BookFrontmatterEntry;
      }

      return {
        kind: "generic",
        marker,
        id,
        sid,
        value,
        hiddenTrailingTokens,
        tokens: chunk,
      } satisfies BookFrontmatterEntry;
    })
    .filter((entry): entry is BookFrontmatterEntry => entry !== null);
}

function createMarkerTextNode(args: {
  marker: string;
  text?: string;
  id?: string;
  sid?: string;
}): SerializedUSFMTextNode {
  return createSerializedUSFMTextNode({
    text: args.text ?? `\\${args.marker} `,
    id: args.id ?? guidGenerator(),
    sid: args.sid ?? "",
    tokenType: UsfmTokenTypes.marker,
    marker: args.marker,
    inPara: args.marker,
  });
}

function createValueTextNode(args: {
  text: string;
  sid?: string;
}): SerializedUSFMTextNode {
  return createSerializedUSFMTextNode({
    text: args.text,
    id: guidGenerator(),
    sid: args.sid ?? "",
    tokenType: UsfmTokenTypes.text,
  });
}

function serializeEntryValue(entry: BookFrontmatterEntry): string {
  switch (entry.kind) {
    case "id":
      return [entry.code.trim(), entry.content.trim()]
        .filter(Boolean)
        .join(" ");
    case "ide":
      return entry.encoding.trim();
    case "generic":
      return entry.value;
  }
}

function serializeEntry(entry: BookFrontmatterEntry): SerializedLexicalNode[] {
  if (entry.kind === "id") {
    const code = entry.code.trim();
    const content = entry.content.trim();
    const tokens: SerializedLexicalNode[] = [
      createMarkerTextNode({
        marker: "id",
        id: entry.id,
        sid: entry.markerSid,
        text: (isMarkerNode(entry.tokens[0]) && entry.tokens[0].text) || "\\id",
      }),
    ];

    if (code.length > 0) {
      // A `bookCode` token carries a payload Onion refuses to receive
      // incomplete: the code plus its verdict on whether that code is a
      // recognized USFM book identifier. The verdict is Onion's, not ours, so
      // it can only be carried — which works whenever the card round-trips
      // the code unchanged, the ordinary case for a form that exists to edit
      // the OTHER frontmatter fields. Reuse the token's own id too: minting a
      // fresh one on every serialization would make a stable card produce an
      // unstable stream.
      const original = entry.tokens.find(
        (token): token is SerializedUSFMTextNode =>
          isSerializedUSFMTextNode(token) && token.tokenType === "bookCode",
      );
      const carried =
        original?.text.trim() === code &&
        original.bookCode !== undefined &&
        original.bookCodeValid !== undefined
          ? original
          : undefined;
      tokens.push(
        createSerializedUSFMTextNode({
          text: ` ${code}`,
          id: carried?.id ?? guidGenerator(),
          sid: entry.sid,
          tokenType: "bookCode",
          bookCode: carried?.bookCode,
          bookCodeValid: carried?.bookCodeValid,
        }),
      );
    }

    if (content.length > 0) {
      tokens.push(
        createValueTextNode({
          text: ` ${content}`,
          sid: entry.sid,
        }),
      );
    }

    tokens.push({ type: "linebreak", version: 1 } as SerializedLexicalNode);
    tokens.push(...entry.hiddenTrailingTokens);
    return tokens;
  }

  const value = serializeEntryValue(entry);
  const tokens: SerializedLexicalNode[] = [
    createMarkerTextNode({
      marker: entry.marker,
      id: entry.id,
      sid: entry.sid,
    }),
  ];

  if (value.length > 0) {
    tokens.push(
      createValueTextNode({
        text: value,
        sid: entry.sid,
      }),
    );
  }

  tokens.push({ type: "linebreak", version: 1 } as SerializedLexicalNode);
  tokens.push(...entry.hiddenTrailingTokens);
  return tokens;
}

export function serializeBookFrontmatterEntries(
  entries: BookFrontmatterEntry[],
): SerializedLexicalNode[] {
  return entries.flatMap(serializeEntry);
}

export function createBookFrontmatterEntry(args: {
  marker: "id" | "h" | "toc1" | "toc2" | "toc3" | "mt";
  sid: string;
}): BookFrontmatterEntry {
  const id = guidGenerator();

  switch (args.marker) {
    case "id":
      return {
        kind: "id",
        marker: "id",
        id,
        markerSid: "",
        sid: args.sid,
        code: "",
        content: "",
        hiddenTrailingTokens: [],
        tokens: [],
      };
    case "h":
    case "toc1":
    case "toc2":
    case "toc3":
    case "mt":
      return {
        kind: "generic",
        marker: args.marker,
        id,
        sid: args.sid,
        value: "",
        hiddenTrailingTokens: [],
        tokens: [],
      };
  }
}
