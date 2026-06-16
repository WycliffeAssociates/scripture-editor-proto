import { describe, expect, it } from "vitest";

import type { ScriptureChapterState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { shouldSkipEmptyEditorSnapshot } from "@/app/ui/hooks/useEditorState.tsx";

function makeChapterState(
  overrides: Partial<ScriptureChapterState> = {},
): ScriptureChapterState {
  return {
    chapterNumber: 1,
    dirty: false,
    eol: "\n",
    direction: "ltr",
    sourceTokens: [],
    currentTokens: [],
    ...overrides,
  };
}

describe("shouldSkipEmptyEditorSnapshot", () => {
  it("skips persisting an empty editor snapshot over a populated chapter", () => {
    expect(
      shouldSkipEmptyEditorSnapshot({
        isEditorStateEmpty: true,
        currentChapterState: makeChapterState({
          sourceTokens: [{ text: "\\c 6", kind: "marker" } as never],
        }),
      }),
    ).toBe(true);
  });

  it("allows persisting when the chapter is genuinely empty", () => {
    expect(
      shouldSkipEmptyEditorSnapshot({
        isEditorStateEmpty: true,
        currentChapterState: makeChapterState(),
      }),
    ).toBe(false);
  });

  it("does not skip non-empty editor snapshots", () => {
    expect(
      shouldSkipEmptyEditorSnapshot({
        isEditorStateEmpty: false,
        currentChapterState: makeChapterState({
          sourceTokens: [{ text: "\\c 6", kind: "marker" } as never],
        }),
      }),
    ).toBe(false);
  });
});
