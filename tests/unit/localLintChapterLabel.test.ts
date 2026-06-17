import { describe, expect, it } from "vitest";

import { chapterLabelIssuesFor } from "@/app/domain/editor/pipelines/localLintPipeline.ts";
import type { ScriptureChapterState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

let nextId = 0;
function tok(kind: Token["kind"], source: string, marker?: string): Token {
  nextId += 1;
  return { id: `t${nextId}`, kind, source, marker } as Token;
}
/** A chapter whose stream carries `\cl <label>` (marker then its text token). */
function chapterWithLabel(label: string): ScriptureChapterState {
  return {
    currentTokens: [
      tok("marker", "\\c", "c"),
      tok("number", "3"),
      tok("marker", "\\cl", "cl"),
      tok("text", label),
    ],
    sourceTokens: [],
    chapterNumber: 3,
  } as unknown as ScriptureChapterState;
}

describe("chapterLabelIssuesFor (Tier B \\cl)", () => {
  it("flags a label whose stem differs from the project dominant", () => {
    const issues = chapterLabelIssuesFor(chapterWithLabel("Wase 3"), "Marika");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ label: "Wase", dominant: "Marika" });
    expect(typeof issues[0].textTokenId).toBe("string");
  });

  it("is silent when the label matches the dominant stem", () => {
    expect(
      chapterLabelIssuesFor(chapterWithLabel("Marika 3"), "Marika"),
    ).toEqual([]);
  });

  it("is silent when there is no dominant (no \\cl in the project)", () => {
    expect(chapterLabelIssuesFor(chapterWithLabel("Wase 3"), null)).toEqual([]);
  });
});
