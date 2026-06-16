import { describe, expect, test } from "vitest";

import { loadTranslationNotesForAnchor } from "@/app/reference/translationNotes.ts";
import type { TranslationNotesItem } from "@/core/library/LibraryItem.ts";

describe("translation notes adapter", () => {
  test("loads TN entries for the active chapter anchor through the packed reader seam", async () => {
    const packedBook = {
      bookCode: "LUK",
      chapters: [
        {
          chapterNumber: 22,
          verses: [
            {
              verseNumber: 71,
              rawMarkdown:
                '# Why do we still need a witness?\n\n"We have no further need for witnesses!"',
            },
          ],
        },
      ],
    };
    const resource: TranslationNotesItem = {
      id: "en_tn_condensed",
      displayName: "English Translation Notes Condensed",
      managedPath: "/projects/en_tn_condensed",
      containerFormat: "resource-container",
      language: {
        code: "en",
        name: "English",
        direction: "ltr",
      },
      capabilities: {},
      type: "translationNotes",
      listBookCodes: async () => ["LUK"],
      readBook: async (bookCode) => (bookCode === "LUK" ? packedBook : null),
      readChapter: async () => ({
        "71": '# Why do we still need a witness?\n\n"We have no further need for witnesses!"',
      }),
    };

    const notes = await loadTranslationNotesForAnchor({
      resource,
      anchor: {
        bookCode: "LUK",
        chapterNumber: 22,
      },
    });

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      bookCode: "LUK",
      chapterNumber: 22,
      verseNumber: 71,
    });
    expect(notes[0].rawMarkdown).toContain("Why do we still need a witness?");
    expect(notes[0].rawMarkdown).toContain(
      '"We have no further need for witnesses!"',
    );
  });
});
