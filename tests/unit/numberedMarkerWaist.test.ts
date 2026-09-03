// The two serialization waists for numbered-marker nodes (plan §6):
// flat→tree pairing (load/mode-switch/paste) and tree→flat emission
// (save/lint/diff/mode-switch). What matters to the user: bytes round-trip
// exactly (I1), the token stream the editor hands onion matches what the
// lexer would produce (I2), and finding anchors (token ids) survive the
// 1 node ⇄ 2–3 token conversion in both directions (I3).
import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { normalizeTokenSids } from "usfm-onion-web/token-sids";
import { describe, expect, it } from "vitest";

import { EDITOR_SHAPES, USFM_PARAGRAPH_NODE_TYPE } from "@/app/data/editor.ts";
import {
  isSerializedUSFMNumberedMarkerNode,
  type SerializedUSFMNumberedMarkerNode,
} from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";
import type { USFMParagraphNodeJSON } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
  lexicalToTokens,
  tokensToLexical,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

async function loadRegular(usfm: string) {
  const { tokens } = await webUsfmOnionService.parseUsfm(usfm);
  return {
    tokens,
    state: tokensToLexical({
      tokens,
      direction: "ltr",
      mode: EDITOR_SHAPES.regular,
    }),
  };
}

function collectNumbered(
  nodes: SerializedLexicalNode[],
): SerializedUSFMNumberedMarkerNode[] {
  const out: SerializedUSFMNumberedMarkerNode[] = [];
  for (const node of nodes) {
    if (isSerializedUSFMNumberedMarkerNode(node)) out.push(node);
    const children = (node as { children?: SerializedLexicalNode[] }).children;
    if (children) out.push(...collectNumbered(children));
  }
  return out;
}

const SIMPLE = "\\id GEN test\n\\c 1\n\\p\n\\v 1 In the beginning\n\\v 2 God\n";

describe("flat→tree pairing", () => {
  it("pairs marker+number into one node per chapter/verse", async () => {
    const { state } = await loadRegular(SIMPLE);
    const numbered = collectNumbered(
      state.root.children as SerializedLexicalNode[],
    );
    expect(numbered.map((n) => [n.marker, n.openBytes, n.text])).toEqual([
      ["c", "\\c ", "1"],
      ["v", "\\v ", "1 "],
      ["v", "\\v ", "2 "],
    ]);
  });

  it("retains both original token ids on the node (I3)", async () => {
    const { tokens, state } = await loadRegular(SIMPLE);
    const v1Marker = tokens.find(
      (t) => t.kind === "marker" && t.marker === "v",
    );
    const v1Number = tokens[tokens.indexOf(v1Marker!) + 1];
    const numbered = collectNumbered(
      state.root.children as SerializedLexicalNode[],
    );
    const v1 = numbered.find((n) => n.marker === "v");
    expect(v1?.openId).toBe(v1Marker?.id);
    expect(v1?.id).toBe(v1Number?.id);
  });

  it("represents a newline-separated \\v as an EMPTY node + flat orphan number (total rule)", async () => {
    // `\v\n13` — newline-satisfiable delimiter: the marker arrives
    // unpaired; the number token (the lexer's pending payload crosses
    // the newline) stays flat so its `number` kind survives re-lex.
    const usfm = "\\id GEN x\n\\c 1\n\\p\n\\v\n13 thirteen\n";
    const { state } = await loadRegular(usfm);
    const numbered = collectNumbered(
      state.root.children as SerializedLexicalNode[],
    );
    const v = numbered.find((n) => n.marker === "v");
    expect(v?.text).toBe("");
    expect(v?.openBytes).toBe("\\v");
    // Round-trip stays byte-identical despite the bad state.
    const roundTripped = lexicalToTokens(state)
      .map((t) => t.source)
      .join("");
    expect(roundTripped).toBe(usfm);
  });

  it("gives the chapter node a byte-less shell container", async () => {
    const { state } = await loadRegular(SIMPLE);
    const shells = (state.root.children as SerializedLexicalNode[]).filter(
      (n): n is USFMParagraphNodeJSON =>
        n.type === USFM_PARAGRAPH_NODE_TYPE &&
        (n as USFMParagraphNodeJSON).marker === "c",
    );
    expect(shells).toHaveLength(1);
    expect(shells[0].markerText).toBe("");
    expect(
      collectNumbered(shells[0].children as SerializedLexicalNode[]).map(
        (n) => n.marker,
      ),
    ).toEqual(["c"]);
  });
});

describe("tree→flat emission", () => {
  it("emits SID-normalizable number metadata after a regular-editor round trip", async () => {
    const { state } = await loadRegular(
      "\\id LUK test\n\\c 10\n\\p\n\\v 42 Verse text\n",
    );
    const workingTokens = lexicalToTokens(state);
    const normalized = normalizeTokenSids(workingTokens, "LUK");

    expect(
      workingTokens
        .filter((token) => token.kind === "number")
        .map((token) => token.numberInfo),
    ).toEqual([
      { start: 10, kind: "single" },
      { start: 42, kind: "single" },
    ]);
    expect(normalized.at(-1)?.sid).toBe("LUK 10:42");
  });

  it("rejects an unknown serialized editor token type at the Onion boundary", () => {
    const state = {
      root: {
        type: "root",
        version: 1,
        children: [
          {
            type: "paragraph",
            version: 1,
            children: [
              {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                tokenType: "renamed-number-token",
                id: "bad-token",
                text: "42",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
              },
            ],
          },
        ],
      },
    } as unknown as SerializedEditorState;

    expect(() => lexicalToTokens(state)).toThrow(
      "Unknown editor token type at Onion boundary: renamed-number-token",
    );
  });

  it("emits 2 tokens per node and reproduces the input bytes (I1/I2)", async () => {
    const { state } = await loadRegular(SIMPLE);
    const tokens = lexicalToTokens(state);
    expect(tokens.map((t) => t.source).join("")).toBe(SIMPLE);
    const v1Index = tokens.findIndex(
      (t) => t.kind === "marker" && t.marker === "v",
    );
    expect(tokens[v1Index].source).toBe("\\v ");
    expect(tokens[v1Index + 1].kind).toBe("number");
    expect(tokens[v1Index + 1].source).toBe("1 ");
  });

  it("emits NO number token for an empty node — the marker alone, as the lexer would", async () => {
    const usfm = "\\id GEN x\n\\c 1\n\\p\n\\v\n13 thirteen\n";
    const { state } = await loadRegular(usfm);
    const tokens = lexicalToTokens(state);
    const vIndex = tokens.findIndex(
      (t) => t.kind === "marker" && t.marker === "v",
    );
    expect(tokens[vIndex].source).toBe("\\v");
    // Next is the newline, then the orphan number — no zero-length token.
    expect(tokens[vIndex + 1].kind).toBe("newline");
    expect(tokens.every((t) => t.source.length > 0)).toBe(true);
  });

  it("emits number content it cannot parse as the TEXT token the lexer would", async () => {
    const { state } = await loadRegular(SIMPLE);
    const [verse] = collectNumbered(
      state.root.children as SerializedLexicalNode[],
    ).filter((n) => n.marker === "v");
    for (const text of [" ", "a ", "0 "]) {
      verse.text = text;
      const tokens = lexicalToTokens(state);
      const vIndex = tokens.findIndex(
        (t) => t.kind === "marker" && t.marker === "v",
      );
      expect(tokens[vIndex + 1]).toMatchObject({ kind: "text", source: text });
      expect(tokens[vIndex + 1].numberInfo).toBeUndefined();
    }
  });

  it("preserves junk whitespace parked in the number content", async () => {
    const usfm = "\\id GEN x\n\\c 1\n\\p\n\\v    7 junk\n";
    const { state } = await loadRegular(usfm);
    const numbered = collectNumbered(
      state.root.children as SerializedLexicalNode[],
    );
    expect(numbered.find((n) => n.marker === "v")?.text).toBe("   7 ");
    expect(
      lexicalToTokens(state)
        .map((t) => t.source)
        .join(""),
    ).toBe(usfm);
  });

  it("keeps token ids stable across a full there-and-back (mode-switch contract, I3)", async () => {
    const { tokens, state } = await loadRegular(SIMPLE);
    const reEmitted = lexicalToTokens(state);
    const originalIds = tokens.map((t) => t.id);
    const reEmittedIds = reEmitted.map((t) => t.id);
    // Newline tokens get fresh linebreak ids by construction; everything
    // else (markers, numbers, text, bookCode) must keep its identity.
    const keyed = (ids: string[], toks: typeof tokens) =>
      ids.filter((_, i) => toks[i].kind !== "newline");
    expect(keyed(reEmittedIds, reEmitted)).toEqual(keyed(originalIds, tokens));
  });
});

describe("sid recompute over numbered tokenlikes (mutAddSids)", () => {
  it("derives chapter/verse sids from single numbered tokenlikes", async () => {
    const { mutAddSids } = await import("@/core/domain/usfm/parseUtils.ts");
    // The metadata pass projects each numbered node as ONE tokenlike
    // (marker identity + number content) so the write-back stays 1:1
    // with nodes.
    const tokens = [
      { tokenType: "numberedMarker", marker: "c", text: "1" },
      { tokenType: "numberedMarker", marker: "v", text: "1 " },
      { tokenType: "text", text: "In the beginning" },
      { tokenType: "numberedMarker", marker: "v", text: "2 " },
      { tokenType: "text", text: "God" },
    ] as Array<{
      tokenType: string;
      marker?: string;
      text: string;
      sid?: string;
    }>;
    mutAddSids(tokens, "GEN");
    expect(tokens.map((t) => t.sid)).toEqual([
      "GEN 1:0",
      "GEN 1:1",
      "GEN 1:1",
      "GEN 1:2",
      "GEN 1:2",
    ]);
  });
});
