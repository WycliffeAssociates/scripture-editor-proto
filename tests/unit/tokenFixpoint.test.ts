// The I2 fixpoint alarm must catch real tokenization drift without crying
// wolf on the one sanctioned shape difference (synthetic paragraph markers
// carrying their trailing trivia in one token). These tests pin the matcher's
// contract, not its implementation.
import { describe, expect, it } from "vitest";

import { compareTokenFixpoint } from "@/app/domain/editor/pipelines/tokenFixpointPipeline.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

function tok(kind: Token["kind"], source: string): Token {
  return {
    id: `${kind}-${source}`,
    kind,
    source,
    span: { start: 0, end: source.length },
    sid: "",
  } as Token;
}

describe("compareTokenFixpoint", () => {
  it("accepts an identical stream", () => {
    const stream = [
      tok("marker", "\\v "),
      tok("number", "2 "),
      tok("text", "In the beginning"),
    ];
    expect(compareTokenFixpoint(stream, stream)).toBeNull();
  });

  it("tolerates a synthetic paragraph marker that absorbed its newline", () => {
    const editor = [tok("marker", "\\p\n"), tok("text", "content")];
    const lexer = [
      tok("marker", "\\p"),
      tok("newline", "\n"),
      tok("text", "content"),
    ];
    expect(compareTokenFixpoint(editor, lexer)).toBeNull();
  });

  it("flags a kind mismatch at the right index", () => {
    const editor = [tok("marker", "\\v "), tok("text", "2 ")];
    const lexer = [tok("marker", "\\v "), tok("number", "2 ")];
    expect(compareTokenFixpoint(editor, lexer)).toEqual({
      index: 1,
      editor: { kind: "text", source: "2 " },
      lexer: { kind: "number", source: "2 " },
    });
  });

  it("flags a boundary shift (same bytes, different split)", () => {
    // "\v 5" typed as one text token serializes byte-identically but is
    // the wrong stream — the classic axis-2 failure.
    const editor = [tok("text", "\\v 5"), tok("text", " content")];
    const lexer = [
      tok("marker", "\\v "),
      tok("number", "5 "),
      tok("text", "content"),
    ];
    expect(compareTokenFixpoint(editor, lexer)).not.toBeNull();
  });

  it("flags trailing lexer tokens the editor stream lacks", () => {
    const editor = [tok("marker", "\\v ")];
    const lexer = [tok("marker", "\\v "), tok("number", "5 ")];
    expect(compareTokenFixpoint(editor, lexer)).toEqual({
      index: 1,
      editor: null,
      lexer: { kind: "number", source: "5 " },
    });
  });
});
