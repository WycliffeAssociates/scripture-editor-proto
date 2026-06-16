import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";

import type { USFMNodeJSON } from "@/app/data/editor.ts";
import { USFM_PARAGRAPH_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import {
  BOOK_FRONTMATTER_FORM_NODE_TYPE,
  isSerializedBookFrontmatterFormNode,
} from "@/app/domain/editor/nodes/BookFrontmatterFormNode.tsx";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { groupFlatTokensByChapter } from "@/app/domain/editor/serialization/flatTokensByChapter.ts";
import { groupFlatNodesIntoParagraphContainers } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import {
  lexicalToTokens,
  tokensToLexical,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

const usfmWithFootnote =
  "\\c 1\n" +
  "\\v 9 The land mourns and wastes away; " +
  "\\f + \\ft The word mourns. \\f*";

async function getProjectedState(mode: "regular" | "flat") {
  const projected = await webUsfmOnionService.parseUsfm(
    `\\id GEN\n${usfmWithFootnote}`,
  );
  return tokensToLexical({
    tokens: projected.tokens,
    direction: "ltr",
    mode,
  });
}

describe("tokensToLexical nested editor invariants", () => {
  it("uses nested decorator nodes in regular mode", async () => {
    const lexicalState = await getProjectedState("regular");

    const flat = materializeFlatTokensArray(
      lexicalState.root.children as SerializedLexicalNode[],
      { nested: "preserve" },
    );
    expect(flat.some(isSerializedUSFMNestedEditorNode)).toBe(true);
  });

  it("flattens nested markers in usfm/plain modes", async () => {
    const lexicalState = await getProjectedState("flat");

    const flat = materializeFlatTokensArray(
      lexicalState.root.children as SerializedLexicalNode[],
      { nested: "preserve" },
    );
    expect(flat.some(isSerializedUSFMNestedEditorNode)).toBe(false);
  });
});

describe("tokensToLexical chapter 0 frontmatter form", () => {
  it("projects chapter 0 to a frontmatter decorator in regular mode", async () => {
    const projected = await webUsfmOnionService.parseUsfm(
      [
        "\\id GEN Unlocked Literal Bible",
        "\\ide UTF-8",
        "\\h Genesis",
        "\\toc1 The Book of Genesis",
        "\\toc2 Genesis",
        "\\toc3 Gen",
        "\\mt Genesis",
        "\\c 1",
        "\\v 1 In the beginning",
      ].join("\n"),
    );

    const lexicalState = tokensToLexical({
      tokens: groupFlatTokensByChapter(projected.tokens)[0] ?? [],
      direction: "ltr",
      mode: "regular",
    });

    const chapterZeroChildren = lexicalState.root
      .children as SerializedLexicalNode[];
    expect(chapterZeroChildren[0]?.type).toBe(BOOK_FRONTMATTER_FORM_NODE_TYPE);
    expect(isSerializedBookFrontmatterFormNode(chapterZeroChildren[0])).toBe(
      true,
    );
  });

  it("round-trips chapter 0 frontmatter back to the original token stream", async () => {
    const projected = await webUsfmOnionService.parseUsfm(
      [
        "\\id GEN Unlocked Literal Bible",
        "\\ide CP-1252",
        "\\h Genesis",
        "\\toc1 The Book of Genesis",
        "\\toc2 Genesis",
        "\\toc3 Gen",
        "\\mt Genesis",
        "\\m stray intro paragraph",
        "\\abc Unsupported marker value",
        "\\c 1",
        "\\v 1 In the beginning",
      ].join("\n"),
    );

    const lexicalState = tokensToLexical({
      tokens: groupFlatTokensByChapter(projected.tokens)[0] ?? [],
      direction: "ltr",
      mode: "regular",
    });
    const roundTripped = lexicalToTokens(lexicalState);
    const originalChapterZero =
      groupFlatTokensByChapter(projected.tokens)[0] ?? [];

    expect(
      roundTripped.map((token) => ({
        source: token.source,
        kind: token.kind,
        sid: token.sid ?? "",
        marker: token.marker ?? "",
      })),
    ).toEqual(
      originalChapterZero.map((token) => ({
        source: token.source,
        kind: token.kind,
        sid: token.sid ?? "",
        marker: token.marker ?? "",
      })),
    );
  });

  it("preserves the special \\id token boundaries and sid layout", async () => {
    const projected = await webUsfmOnionService.parseUsfm(
      [
        "\\id GEN Unlocked Literal Bible",
        "\\ide UTF-8",
        "\\h Genesis",
        "\\c 1",
        "\\v 1 In the beginning",
      ].join("\n"),
    );

    const lexicalState = tokensToLexical({
      tokens: groupFlatTokensByChapter(projected.tokens)[0] ?? [],
      direction: "ltr",
      mode: "regular",
    });
    const roundTripped = lexicalToTokens(lexicalState);
    const idSlice = roundTripped.slice(0, 4).map((token) => ({
      source: token.source,
      kind: token.kind,
      sid: token.sid ?? "",
      marker: token.marker ?? "",
    }));
    // Delimiter parking (onion delimiter-trivia): the marker absorbs its
    // required delimiter; the bookCode absorbs its own terminator; text
    // arrives content-pure. Byte total across the slice is unchanged.
    expect(idSlice).toEqual([
      {
        source: "\\id ",
        kind: "marker",
        sid: "",
        marker: "id",
      },
      {
        source: "GEN ",
        kind: "bookCode",
        sid: "GEN 0:0",
        marker: "",
      },
      {
        source: "Unlocked Literal Bible",
        kind: "text",
        sid: "GEN 0:0",
        marker: "",
      },
      {
        source: "\n",
        kind: "newline",
        sid: "GEN 0:0",
        marker: "",
      },
    ]);
  });

  it("preserves hidden extra linebreak tokens between frontmatter entries", async () => {
    const projected = await webUsfmOnionService.parseUsfm(
      [
        "\\id GEN Unlocked Literal Bible",
        "\\ide UTF-8",
        "\\h Genesis",
        "\\toc1 The Book of Genesis",
        "\\toc2 Genesis",
        "\\toc3 Gen",
        "\\mt Genesis",
        "",
        "\\s5",
        "\\c 1",
        "\\v 1 In the beginning",
      ].join("\n"),
    );

    const lexicalState = tokensToLexical({
      tokens: groupFlatTokensByChapter(projected.tokens)[0] ?? [],
      direction: "ltr",
      mode: "regular",
    });

    const roundTripped = lexicalToTokens(lexicalState);
    const originalChapterZero =
      groupFlatTokensByChapter(projected.tokens)[0] ?? [];

    expect(roundTripped.map((token) => token.source)).toEqual(
      originalChapterZero.map((token) => token.source),
    );
  });
});

describe("groupFlatNodesIntoParagraphContainers whitespace placement", () => {
  it("preserves paragraph marker trailing whitespace on the marker token", () => {
    const flat: SerializedLexicalNode[] = [
      {
        type: "usfm-text-node",
        lexicalType: "usfm-text-node",
        tokenType: UsfmTokenTypes.marker,
        marker: "p",
        text: "\\p ",
        id: "m1",
        sid: "GEN 1:0",
        version: 1,
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
      } as unknown as SerializedLexicalNode,
      {
        type: "usfm-text-node",
        lexicalType: "usfm-text-node",
        tokenType: UsfmTokenTypes.text,
        text: "Text",
        id: "t1",
        sid: "GEN 1:1",
        version: 1,
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
      } as unknown as SerializedLexicalNode,
    ];

    const result = groupFlatNodesIntoParagraphContainers(
      flat as unknown as USFMNodeJSON[],
      "ltr",
    ) as unknown as Array<{
      type: string;
      markerText?: string;
      children?: Array<{ text?: string }>;
    }>;

    expect(result[0]?.type).toBe(USFM_PARAGRAPH_NODE_TYPE);
    expect(result[0]?.markerText).toBe("\\p ");
    expect(result[0]?.children?.[0]?.text).toBe("Text");
  });

  it("preserves chapter marker trailing whitespace on the marker token", () => {
    const flat: SerializedLexicalNode[] = [
      {
        type: "usfm-text-node",
        lexicalType: "usfm-text-node",
        tokenType: UsfmTokenTypes.marker,
        marker: "c",
        text: "\\c ",
        id: "m1",
        sid: "GEN 1:0",
        version: 1,
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
      } as unknown as SerializedLexicalNode,
      {
        type: "usfm-text-node",
        lexicalType: "usfm-text-node",
        tokenType: UsfmTokenTypes.numberRange,
        text: "1",
        id: "n1",
        sid: "GEN 1:0",
        version: 1,
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
      } as unknown as SerializedLexicalNode,
    ];

    const result = groupFlatNodesIntoParagraphContainers(
      flat as unknown as USFMNodeJSON[],
      "ltr",
    ) as unknown as Array<{
      type: string;
      markerText?: string;
      children?: Array<{ text?: string }>;
    }>;

    expect(result[0]?.type).toBe(USFM_PARAGRAPH_NODE_TYPE);
    expect(result[0]?.markerText).toBe("\\c ");
    expect(result[0]?.children?.[0]?.text).toBe("1");
  });

  it("preserves marker trailing whitespace when the paragraph is empty (marker + linebreak)", () => {
    const flat: SerializedLexicalNode[] = [
      {
        type: "usfm-text-node",
        lexicalType: "usfm-text-node",
        tokenType: UsfmTokenTypes.marker,
        marker: "q1",
        text: "\\q1 ",
        id: "m1",
        sid: "GEN 3:14",
        version: 1,
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
      } as unknown as SerializedLexicalNode,
      {
        type: "linebreak",
        version: 1,
      } as unknown as SerializedLexicalNode,
    ];

    const result = groupFlatNodesIntoParagraphContainers(
      flat as unknown as USFMNodeJSON[],
      "ltr",
    ) as unknown as Array<{
      type: string;
      markerText?: string;
      children?: Array<{ type?: string; text?: string }>;
    }>;

    expect(result[0]?.type).toBe(USFM_PARAGRAPH_NODE_TYPE);
    expect(result[0]?.markerText).toBe("\\q1 ");
    expect(result[0]?.children?.[0]?.type).toBe("linebreak");
  });

  it("round-trips adjacent inline note markers with explicit separator spaces", async () => {
    const usfm =
      "\\c 148\n" +
      "\\q2 praise Him in the highest places.\\f + \\fr 148:1 \\ft See \\+xt Matthew 21:9,\\+xt* \\+xt Mark 11:10,\\+xt* and \\+xt Luke 19:38\\+xt*.\\f*\n";

    const projected = await webUsfmOnionService.parseUsfm(`\\id PSA\n${usfm}`);
    const lexicalState = tokensToLexical({
      tokens: projected.tokens,
      direction: "ltr",
      mode: "regular",
    });
    const roundTripped = materializeFlatTokensArray(
      lexicalState.root.children as SerializedLexicalNode[],
    )
      .map((node) =>
        "text" in node && typeof node.text === "string" ? node.text : "",
      )
      .join("");

    expect(roundTripped).toContain(
      "\\+xt Matthew 21:9,\\+xt* \\+xt Mark 11:10,\\+xt*",
    );
    expect(roundTripped).not.toContain("\\+xt*\\+xt");
  });
});
