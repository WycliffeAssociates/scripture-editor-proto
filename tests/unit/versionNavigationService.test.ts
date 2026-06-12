import { serializeToUsfmString } from "@tests/helpers/serializeToUsfmString.ts";
import { makeBook, makeChapter } from "@tests/helpers/workspaceFixtures.ts";
import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";

import { applyVersionSnapshotToWorkingFiles } from "@/app/domain/project/versionNavigationService.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";

function makeFiles(args: {
  loadedText: string;
  currentText: string;
  bookCode?: string;
  chapterNum?: number;
}): ScriptureBookState[] {
  const bookCode = args.bookCode ?? "GEN";
  return [
    makeBook({
      bookCode,
      chapters: [
        makeChapter({
          bookCode,
          chapterNumber: args.chapterNum ?? 1,
          text: args.currentText,
          sourceText: args.loadedText,
        }),
      ],
    }),
  ];
}

function chapterUsfm(
  state: SerializedEditorState<SerializedLexicalNode>,
): string {
  return serializeToUsfmString(state.root.children);
}

describe("versionNavigationService.applyVersionSnapshotToWorkingFiles", () => {
  it("re-baselines loaded state to selected snapshot", () => {
    const working = makeFiles({
      loadedText: "latest",
      currentText: "latest",
    });
    const older = makeFiles({
      loadedText: "older",
      currentText: "older",
    });

    applyVersionSnapshotToWorkingFiles({
      workingFiles: working,
      sourceFiles: older,
      shape: "flat",
    });

    const chapter = working[0]?.chapters[0];
    expect(chapterUsfm(chapter.lexicalState)).toContain("older");
    expect(chapterUsfm(chapter.loadedLexicalState)).toContain("older");
    expect(chapter.dirty).toBe(false);
  });

  it("stays clean across repeated version hops", () => {
    const working = makeFiles({
      loadedText: "latest",
      currentText: "latest",
    });
    const olderOne = makeFiles({
      loadedText: "older-1",
      currentText: "older-1",
    });
    const olderTwo = makeFiles({
      loadedText: "older-2",
      currentText: "older-2",
    });

    applyVersionSnapshotToWorkingFiles({
      workingFiles: working,
      sourceFiles: olderOne,
      shape: "flat",
    });
    applyVersionSnapshotToWorkingFiles({
      workingFiles: working,
      sourceFiles: olderTwo,
      shape: "flat",
    });

    const chapter = working[0]?.chapters[0];
    expect(chapterUsfm(chapter.lexicalState)).toContain("older-2");
    expect(chapterUsfm(chapter.loadedLexicalState)).toContain("older-2");
    expect(chapter.dirty).toBe(false);
  });
});
