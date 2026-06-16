import { makeBook, makeChapter } from "@tests/helpers/workspaceFixtures.ts";
import { describe, expect, it } from "vitest";

import { tokensToUsfm } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
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
    });

    const chapter = working[0]?.chapters[0];
    expect(tokensToUsfm(chapter.currentTokens, chapter.eol)).toContain("older");
    expect(tokensToUsfm(chapter.sourceTokens, chapter.eol)).toContain("older");
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
    });
    applyVersionSnapshotToWorkingFiles({
      workingFiles: working,
      sourceFiles: olderTwo,
    });

    const chapter = working[0]?.chapters[0];
    expect(tokensToUsfm(chapter.currentTokens, chapter.eol)).toContain(
      "older-2",
    );
    expect(tokensToUsfm(chapter.sourceTokens, chapter.eol)).toContain(
      "older-2",
    );
    expect(chapter.dirty).toBe(false);
  });
});
