import { describe, expect, it } from "vitest";

import {
  BOOK_PERSISTENCE_ACTION_ADD_NEW,
  BOOK_PERSISTENCE_ACTION_SAVE_EXISTING,
  buildBookPersistencePlan,
  buildBooksSavePayload,
} from "@/app/domain/project/saveAndRevertService.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

function makeTokens(text: string, sid: string, id: string): Token[] {
  return [
    {
      id,
      kind: "text",
      span: { start: 0, end: text.length },
      sid,
      source: text,
    },
  ];
}

describe("buildBooksSavePayload", () => {
  it("saves full book content when any chapter in that book is dirty", () => {
    const files: ScriptureBookState[] = [
      {
        path: "/tmp/MRK.usfm",
        title: "Mark",
        bookCode: "MRK",
        nextBookId: null,
        prevBookId: null,
        chapters: [
          {
            chapterNumber: 1,
            dirty: false,
            eol: "\n",
            direction: "ltr",
            sourceTokens: makeTokens(
              "\\c 1\n\\p\nChapter one.\n",
              "MRK 1:1",
              "m1-loaded",
            ),
            currentTokens: makeTokens(
              "\\c 1\n\\p\nChapter one.\n",
              "MRK 1:1",
              "m1-current",
            ),
          },
          {
            chapterNumber: 15,
            dirty: true,
            eol: "\n",
            direction: "ltr",
            sourceTokens: makeTokens(
              "\\c 15\n\\p\nOld text.\n",
              "MRK 15:1",
              "m15-loaded",
            ),
            currentTokens: makeTokens(
              "\\c 15\n\\p\nNew text.\n",
              "MRK 15:1",
              "m15-current",
            ),
          },
        ],
      },
    ];

    const payload = buildBooksSavePayload(files);

    expect(payload.MRK).toBe(
      "\\c 1\n\\p\nChapter one.\n\\c 15\n\\p\nNew text.\n",
    );
  });
});

describe("buildBookPersistencePlan", () => {
  it("uses saveBook for existing books and addBook for new books", () => {
    const plan = buildBookPersistencePlan({
      existingBooks: [
        {
          bookCode: "MRK",
          storageKey: "42-MRK.usfm",
        },
      ],
      payload: {
        MRK: "\\c 1\nExisting rewrite.\n",
        JHN: "\\c 1\nNew book.\n",
      },
    });

    expect(plan).toEqual([
      {
        kind: BOOK_PERSISTENCE_ACTION_SAVE_EXISTING,
        bookCode: "MRK",
        storageKey: "42-MRK.usfm",
        contents: "\\c 1\nExisting rewrite.\n",
      },
      {
        kind: BOOK_PERSISTENCE_ACTION_ADD_NEW,
        bookCode: "JHN",
        contents: "\\c 1\nNew book.\n",
      },
    ]);
  });
});
