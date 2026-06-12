// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  locateUtf16Offset,
  resolveContentRange,
} from "@/app/domain/editor/annotations/resolveContentRange.ts";
import type { SegmentsBySid } from "@/core/domain/usfm/vrefTypes.ts";

function root(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

/** A text token span carrying `data-id`, optionally split into >1 text node. */
function tokenSpan(id: string, ...textChunks: string[]): HTMLElement {
  const span = document.createElement("span");
  span.setAttribute("data-id", id);
  for (const chunk of textChunks) {
    span.appendChild(document.createTextNode(chunk));
  }
  return span;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("locateUtf16Offset (node-split tolerance)", () => {
  it("maps an offset inside a single text node", () => {
    const span = tokenSpan("a", "In the beginning");
    const loc = locateUtf16Offset(span, 3);
    expect(loc?.node.data).toBe("In the beginning");
    expect(loc?.offset).toBe(3);
  });

  it("maps an offset that falls in a later split node", () => {
    // Lexical can split one logical token's text across text nodes.
    const span = tokenSpan("a", "In ", "the ", "beginning");
    // offset 5 is the 'h' in "the " (3 + 2).
    const loc = locateUtf16Offset(span, 5);
    expect(loc?.node.data).toBe("the ");
    expect(loc?.offset).toBe(2);
  });

  it("lands a boundary offset at the end of the current node", () => {
    const span = tokenSpan("a", "abc", "def");
    const loc = locateUtf16Offset(span, 3);
    expect(loc?.node.data).toBe("abc");
    expect(loc?.offset).toBe(3);
  });

  it("returns null past the end", () => {
    const span = tokenSpan("a", "abc");
    expect(locateUtf16Offset(span, 99)).toBeNull();
  });
});

describe("resolveContentRange", () => {
  // sid "GEN 1:1" projects to "In the  beginning": token a = "In the " [0,7],
  // token b = " " (the offending double-space middle) [7,8], token c =
  // "beginning" [8,17]. (Aligned text: each run its own segment.)
  const segments: SegmentsBySid = {
    "GEN 1:1": [
      { tokenId: "a", textSpan: { start: 0, end: 7 } },
      { tokenId: "b", textSpan: { start: 7, end: 8 } },
      { tokenId: "c", textSpan: { start: 8, end: 17 } },
    ],
  };

  function mount(r: HTMLElement) {
    r.appendChild(tokenSpan("a", "In the "));
    r.appendChild(tokenSpan("b", " "));
    r.appendChild(tokenSpan("c", "beginning"));
  }

  it("collects every token-id a range falls into", () => {
    const r = root();
    mount(r);
    // A range straddling the end of `a`, all of `b`, into `c`.
    const { touchedTokenIds } = resolveContentRange(
      "GEN 1:1",
      { start: 6, end: 9 },
      segments,
      r,
    );
    expect(touchedTokenIds).toEqual(["a", "b", "c"]);
  });

  it("targets a single segment for a sub-token range (the double space)", () => {
    const r = root();
    mount(r);
    const { touchedTokenIds } = resolveContentRange(
      "GEN 1:1",
      { start: 7, end: 8 },
      segments,
      r,
    );
    expect(touchedTokenIds).toEqual(["b"]);
  });

  it("is empty for an unknown sid or a degenerate range", () => {
    const r = root();
    mount(r);
    expect(
      resolveContentRange("NOPE 1:1", { start: 0, end: 3 }, segments, r),
    ).toEqual({ rects: [], touchedTokenIds: [] });
    expect(
      resolveContentRange("GEN 1:1", { start: 5, end: 5 }, segments, r),
    ).toEqual({ rects: [], touchedTokenIds: [] });
  });

  it("resolves across a token whose text node was split", () => {
    const r = root();
    // token `a` split into two text nodes; range lands inside it.
    r.appendChild(tokenSpan("a", "In ", "the "));
    r.appendChild(tokenSpan("c", "beginning"));
    const splitSegments: SegmentsBySid = {
      "GEN 1:1": [
        { tokenId: "a", textSpan: { start: 0, end: 7 } },
        { tokenId: "c", textSpan: { start: 7, end: 16 } },
      ],
    };
    const { touchedTokenIds } = resolveContentRange(
      "GEN 1:1",
      { start: 4, end: 6 },
      splitSegments,
      r,
    );
    expect(touchedTokenIds).toEqual(["a"]);
  });
});
