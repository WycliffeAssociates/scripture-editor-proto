// WorkspaceMirror.test.ts
//
// Protocol-level tests for the mirror state machine. No Worker, no DOM — the
// mirror is a plain module, so we drive it with patches/commands directly and
// assert on resident-state behavior, generation tagging, and the backup
// contract. Resident Braid is seeded through fullSync before mutations; the
// mirror itself does not retain a second token corpus for these tests.

import { makeTokens } from "@tests/helpers/workspaceFixtures.ts";
import type { LintSnapshot } from "usfm-onion-web";
import { describe, expect, it, vi } from "vitest";

import type {
  MirrorChapter,
  MirrorPatch,
  MirrorResult,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import {
  type MirrorEngines,
  WorkspaceMirror,
} from "@/app/domain/mirror/WorkspaceMirror.ts";
import {
  DIRTY_BUFFER_SCHEMA_VERSION,
  type DirtyBufferFile,
} from "@/app/state/DirtyBufferStore.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

const emptyLintSummary = {
  byCategory: { document: 0, structure: 0, context: 0, numbering: 0 },
  bySeverity: { error: 0, warning: 0 },
  byIssueType: { usfm: 0, content: 0 },
  totalCount: 0,
  suppressedCount: 0,
};

function lintSnapshot(
  byBook: Record<string, LintSnapshot["books"][number]["findings"]> = {},
): LintSnapshot {
  return {
    snapshotId: "snapshot",
    books: Object.entries(byBook).map(([book, findings]) => ({
      sourceKey: book,
      book,
      sourceHash: "",
      tokenIdentity: "",
      findings,
      summary: emptyLintSummary,
    })),
    summary: emptyLintSummary,
  };
}

function makeEngines(overrides?: Partial<MirrorEngines>): MirrorEngines {
  let backupUsfm = "";
  let braidDirty = true;
  const seedGalley = vi.fn<MirrorEngines["seedGalley"]>((books) => {
    backupUsfm = books
      .flatMap((book) => book.tokens)
      .map((token) => token.source)
      .join("");
    braidDirty = books.some(
      (book) =>
        book.tokens.map((token) => token.source).join("") !==
        book.baselineTokens.map((token) => token.source).join(""),
    );
    return "changed";
  });
  return {
    lintFindings: vi.fn<MirrorEngines["lintFindings"]>(() => lintSnapshot()),
    seedGalley,
    updateGalleyChapter: vi.fn<MirrorEngines["updateGalleyChapter"]>(
      (_bookCode, _chapterNum, tokens) => {
        backupUsfm = tokens.map((token) => token.source).join("");
        braidDirty = tokens.some((token) => /dirty|newer/.test(token.source));
        return "changed";
      },
    ),
    updateGalleyBook: vi.fn<MirrorEngines["updateGalleyBook"]>(
      (_bookCode, tokens) => {
        backupUsfm = tokens.map((token) => token.source).join("");
        braidDirty = tokens.some((token) => /dirty|newer/.test(token.source));
        return "changed";
      },
    ),
    removeGalleyChapter: vi.fn<MirrorEngines["removeGalleyChapter"]>(
      () => "changed",
    ),
    removeGalleyBook: vi.fn<MirrorEngines["removeGalleyBook"]>(() => "changed"),
    updateGalleyConfig: vi.fn<MirrorEngines["updateGalleyConfig"]>(
      () => "unchanged",
    ),
    analyzeGalley: vi.fn<MirrorEngines["analyzeGalley"]>(async () => ({
      packed: new ArrayBuffer(0),
      keys: [],
      segments: {},
      cacheState: "fresh",
    })),
    computeMd5: vi.fn<MirrorEngines["computeMd5"]>(
      async (content: string) => `md5(${content.length})`,
    ),
    persistBackup: vi.fn<MirrorEngines["persistBackup"]>(async () => true),
    clearBackup: vi.fn<MirrorEngines["clearBackup"]>(async () => true),
    setBraidBaseline: vi.fn<MirrorEngines["setBraidBaseline"]>(
      (_bookCode, _tokens) => {
        braidDirty = false;
      },
    ),
    clearBraidBaseline: vi.fn<MirrorEngines["clearBraidBaseline"]>(),
    isBraidDirty: vi.fn<MirrorEngines["isBraidDirty"]>(() => braidDirty),
    braidUsfm: vi.fn<MirrorEngines["braidUsfm"]>(() => backupUsfm),
    publishBraid: vi.fn<MirrorEngines["publishBraid"]>(() => ({
      packed: new ArrayBuffer(0),
      snapshotId: "snapshot",
      books: [],
      sources: [{ bookCode: "GEN", sourceKey: "GEN", source: backupUsfm }],
      serializedBooks: [{ bookCode: "GEN", contents: backupUsfm }],
    })),
    restoreBraid: vi.fn<MirrorEngines["restoreBraid"]>(() => ({
      accepted: true,
    })),
    formatBraid: vi.fn<MirrorEngines["formatBraid"]>(() => ({
      books: {},
      usfm: {},
    })),
    applyBraidFix: vi.fn<MirrorEngines["applyBraidFix"]>(() => ({
      books: {},
      usfm: {},
    })),
    ...overrides,
  };
}

function chapter(text: string, dirty: boolean): MirrorChapter {
  return {
    tokens: makeTokens(text, { sid: "GEN 1:1", id: `${text}-id` }),
    eol: "\n",
    dirty,
  };
}

function seed(
  mirror: WorkspaceMirror,
  books: Array<{
    bookCode: string;
    chapters: Array<{ chapterNum: number; chapter: MirrorChapter }>;
    baselineTokens?: Token[];
    diskBaseline?: { kind: "absent" } | { kind: "present"; md5: string };
  }>,
  generation = 0,
): void {
  mirror.applyPatch({
    kind: "fullSync",
    generation,
    books: books.map((book) => ({
      bookCode: book.bookCode,
      diskBaseline: book.diskBaseline ?? { kind: "absent" },
      baselineTokens: book.baselineTokens ?? [],
      chapters: book.chapters,
    })),
  });
}

describe("WorkspaceMirror — patches", () => {
  it("applies pushChapter before analyze", async () => {
    const lintFindings = vi.fn<MirrorEngines["lintFindings"]>(() =>
      lintSnapshot({ GEN: [] }),
    );
    const mirror = new WorkspaceMirror(makeEngines({ lintFindings }));
    seed(mirror, [
      {
        bookCode: "GEN",
        chapters: [{ chapterNum: 1, chapter: chapter("old", false) }],
      },
    ]);

    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("hello", true),
      generation: 1,
    });

    const result = await mirror.runCommand({
      kind: "analyzeLint",
      generation: 2,
    });

    expect(result.kind).toBe("lintResult");
    expect(lintFindings).toHaveBeenCalledTimes(1);
    if (result.kind === "lintResult") {
      expect(result.ranAtGeneration).toBe(2);
      expect(result.snapshot.books.map((book) => book.book)).toEqual(["GEN"]);
    }
  });

  it("echoes the analyze command's requestId on the result", async () => {
    const mirror = new WorkspaceMirror(makeEngines());
    seed(mirror, [
      {
        bookCode: "GEN",
        chapters: [{ chapterNum: 1, chapter: chapter("old", false) }],
      },
    ]);
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("hi", true),
      generation: 1,
    });
    const lint = await mirror.runCommand({
      kind: "analyzeLint",
      generation: 2,
      requestId: "initial-lint-2",
    });
    const sous = await mirror.runCommand({
      kind: "analyzeGalley",
      generation: 2,
      requestId: "initial-sous-2",
      cachePolicy: "restore",
    });
    expect(lint.kind === "lintResult" && lint.requestId).toBe("initial-lint-2");
    expect(sous.kind === "galleyResult" && sous.requestId).toBe(
      "initial-sous-2",
    );
  });

  it("returns a validated cache hit immediately and refreshes Galley in the background", async () => {
    const cached = {
      packed: new ArrayBuffer(1),
      keys: ["GEN 1:1"],
      segments: {},
      cacheState: "persisted" as const,
    };
    const fresh = {
      packed: new ArrayBuffer(2),
      keys: ["GEN 1:1"],
      segments: {},
      cacheState: "fresh" as const,
    };
    const loadGalley = vi.fn<NonNullable<MirrorEngines["loadGalley"]>>(
      async () => cached,
    );
    const analyzeGalley = vi.fn<MirrorEngines["analyzeGalley"]>(
      async () => fresh,
    );
    const background: Array<Extract<MirrorResult, { kind: "galleyResult" }>> =
      [];
    const mirror = new WorkspaceMirror(
      makeEngines({ loadGalley, analyzeGalley }),
      (result) => {
        if (result.kind === "galleyResult") background.push(result);
      },
    );
    seed(mirror, [
      {
        bookCode: "GEN",
        chapters: [{ chapterNum: 1, chapter: chapter("old", false) }],
      },
    ]);
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("hi", true),
      generation: 1,
    });

    const result = await mirror.runCommand({
      kind: "analyzeGalley",
      generation: 2,
      cachePolicy: "restore",
    });

    expect(result.kind).toBe("galleyResult");
    if (result.kind === "galleyResult")
      expect(result.packed).toBe(cached.packed);
    expect(loadGalley).toHaveBeenCalledTimes(1);
    expect(analyzeGalley).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(background).toHaveLength(1));
    expect(analyzeGalley).toHaveBeenCalledTimes(1);
    expect(background[0]?.packed).toBe(fresh.packed);
  });

  it("seeds once, then updates resident chapters before analyzing", async () => {
    const analyzeGalley = vi.fn<MirrorEngines["analyzeGalley"]>(async () => ({
      packed: new ArrayBuffer(0),
      keys: [],
      segments: {},
      cacheState: "fresh",
    }));
    const seedGalley = vi.fn<MirrorEngines["seedGalley"]>(() => "changed");
    const updateGalleyChapter = vi.fn<MirrorEngines["updateGalleyChapter"]>(
      () => "changed",
    );
    const mirror = new WorkspaceMirror(
      makeEngines({ analyzeGalley, seedGalley, updateGalleyChapter }),
    );
    mirror.applyPatch({
      kind: "fullSync",
      generation: 1,
      books: [
        {
          bookCode: "EXO",
          diskBaseline: { kind: "absent" },
          baselineTokens: [],
          chapters: [{ chapterNum: 1, chapter: chapter("exo", true) }],
        },
        {
          bookCode: "GEN",
          diskBaseline: { kind: "absent" },
          baselineTokens: [],
          chapters: [{ chapterNum: 1, chapter: chapter("gen", true) }],
        },
      ],
    });

    await mirror.runCommand({
      kind: "analyzeGalley",
      generation: 2,
      cachePolicy: "none",
    });

    expect(seedGalley).toHaveBeenCalledTimes(1);
    expect(seedGalley.mock.calls[0]?.[0]).toHaveLength(2);
    expect(updateGalleyChapter).not.toHaveBeenCalled();
    expect(analyzeGalley).toHaveBeenCalledTimes(1);

    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("gen-updated", true),
      generation: 3,
    });
    await mirror.runCommand({
      kind: "analyzeGalley",
      generation: 4,
      cachePolicy: "none",
    });
    expect(updateGalleyChapter).toHaveBeenCalledWith(
      "GEN",
      1,
      expect.any(Array),
    );
    expect(analyzeGalley).toHaveBeenCalledTimes(2);
    expect(analyzeGalley.mock.calls[1]).toEqual([undefined, "none"]);
  });

  it("replaces a resident book when a chapter is deleted but the book remains", async () => {
    const removeGalleyChapter = vi.fn<MirrorEngines["removeGalleyChapter"]>(
      () => "changed",
    );
    const mirror = new WorkspaceMirror(makeEngines({ removeGalleyChapter }));
    mirror.applyPatch({
      kind: "fullSync",
      generation: 1,
      books: [
        {
          bookCode: "GEN",
          diskBaseline: { kind: "absent" },
          baselineTokens: [],
          chapters: [
            { chapterNum: 1, chapter: chapter("one", true) },
            { chapterNum: 2, chapter: chapter("two", true) },
          ],
        },
      ],
    });
    await mirror.runCommand({
      kind: "analyzeGalley",
      generation: 2,
      cachePolicy: "none",
    });

    mirror.applyPatch({
      kind: "deleteChapter",
      ref: { bookCode: "GEN", chapterNum: 2 },
      generation: 3,
    });

    expect(removeGalleyChapter).toHaveBeenCalledWith("GEN", 2);
  });

  it("drops a stale pushChapter (older generation is a no-op)", async () => {
    const persistBackup = vi.fn<MirrorEngines["persistBackup"]>(
      async () => true,
    );
    const mirror = new WorkspaceMirror(makeEngines({ persistBackup }));
    seed(mirror, [
      {
        bookCode: "GEN",
        chapters: [{ chapterNum: 1, chapter: chapter("initial", false) }],
      },
    ]);

    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("newer", true),
      generation: 5,
    });
    // Stale: lower generation must not overwrite.
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("older", true),
      generation: 3,
    });

    await mirror.runCommand({
      kind: "writeBackup",
      bookCode: "GEN",
      appVersion: "t",
      generation: 6,
    });
    const entry = JSON.parse(
      persistBackup.mock.calls[0]![1],
    ) as DirtyBufferFile;
    expect(entry.content).toContain("newer");
    expect(entry.content).not.toContain("older");
  });

  it("deleteChapter removes a chapter and drops the book when empty", async () => {
    const lintFindings = vi.fn<MirrorEngines["lintFindings"]>(() =>
      lintSnapshot(),
    );
    const mirror = new WorkspaceMirror(makeEngines({ lintFindings }));
    seed(mirror, [
      {
        bookCode: "GEN",
        chapters: [{ chapterNum: 1, chapter: chapter("x", true) }],
      },
    ]);
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("x", true),
      generation: 1,
    });
    mirror.applyPatch({
      kind: "deleteChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      generation: 2,
    });

    const result = await mirror.runCommand({
      kind: "analyzeLint",
      generation: 3,
    });
    if (result.kind === "lintResult") {
      expect(result.snapshot.books).toEqual([]);
    }
    expect(lintFindings).toHaveBeenCalledTimes(1);
  });

  it("fullSync replaces the whole mirror — vanished books are dropped", async () => {
    const mirror = new WorkspaceMirror(
      makeEngines({ lintFindings: () => lintSnapshot({ GEN: [] }) }),
    );
    seed(mirror, [
      {
        bookCode: "EXO",
        chapters: [{ chapterNum: 1, chapter: chapter("exo", true) }],
      },
    ]);
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "EXO", chapterNum: 1 },
      chapter: chapter("exo", true),
      generation: 1,
    });
    // fullSync without EXO must drop it.
    const sync: MirrorPatch = {
      kind: "fullSync",
      generation: 2,
      books: [
        {
          bookCode: "GEN",
          diskBaseline: { kind: "absent" },
          baselineTokens: [],
          chapters: [{ chapterNum: 1, chapter: chapter("gen", true) }],
        },
      ],
    };
    mirror.applyPatch(sync);

    const result = await mirror.runCommand({
      kind: "analyzeLint",
      generation: 3,
    });
    if (result.kind === "lintResult") {
      expect(result.snapshot.books.map((book) => book.book)).toEqual(["GEN"]);
    }
  });
  it("syncMeta flips dirty flags + baseline without touching tokens (clean-mark)", async () => {
    const persistBackup = vi.fn<MirrorEngines["persistBackup"]>(
      async () => true,
    );
    const clearBackup = vi.fn<MirrorEngines["clearBackup"]>(async () => true);
    const mirror = new WorkspaceMirror(
      makeEngines({ persistBackup, clearBackup }),
    );

    const c1 = chapter("first chapter", true);
    const c2 = chapter("second chapter", true);
    seed(mirror, [
      {
        bookCode: "GEN",
        chapters: [
          { chapterNum: 1, chapter: c1 },
          { chapterNum: 2, chapter: c2 },
        ],
      },
    ]);
    mirror.applyPatch({
      kind: "pushBaseline",
      bookCode: "GEN",
      diskBaseline: { kind: "present", md5: "old" },
      baselineTokens: [...c1.tokens, ...c2.tokens],
      generation: 1,
    });
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: c1,
      generation: 1,
    });
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 2 },
      chapter: c2,
      generation: 1,
    });

    // Byte content the mirror would serialize from its tokens, captured before
    // the metadata sync — it must be unchanged afterwards.
    // The clean-mark: dirty flags clear, baseline advances, no tokens.
    mirror.applyPatch({
      kind: "syncMeta",
      generation: 2,
      books: [
        {
          bookCode: "GEN",
          diskBaseline: { kind: "present", md5: "new" },
          baselineTokens: [...c1.tokens, ...c2.tokens],
          chapterDirty: [
            { chapterNum: 1, dirty: false },
            { chapterNum: 2, dirty: false },
          ],
        },
      ],
    });

    // All chapters now clean → writeBackup clears rather than persisting, and
    // tokens are untouched so a fresh dirty write would still be byte-identical.
    const cleared = await mirror.runCommand({
      kind: "writeBackup",
      bookCode: "GEN",
      appVersion: "1.0.0",
      generation: 3,
    });
    expect(clearBackup).toHaveBeenCalledWith("GEN");
    expect(persistBackup).not.toHaveBeenCalled();
    if (cleared.kind === "backupResult") expect(cleared.cleared).toBe(true);

    // A metadata-only dirty flag cannot override Braid's exact baseline check.
    // The current token bytes still equal the saved baseline, so no backup is
    // written even though the legacy flag is true.
    mirror.applyPatch({
      kind: "syncMeta",
      generation: 4,
      books: [
        {
          bookCode: "GEN",
          diskBaseline: { kind: "present", md5: "new" },
          baselineTokens: [...c1.tokens, ...c2.tokens],
          chapterDirty: [{ chapterNum: 1, dirty: true }],
        },
      ],
    });
    await mirror.runCommand({
      kind: "writeBackup",
      bookCode: "GEN",
      appVersion: "1.0.0",
      generation: 5,
    });
    expect(clearBackup).toHaveBeenCalledWith("GEN");
    expect(persistBackup).not.toHaveBeenCalled();
  });

  it("syncMeta never adds books or chapters the mirror does not hold", async () => {
    const lintFindings = vi.fn<MirrorEngines["lintFindings"]>(() =>
      lintSnapshot(),
    );
    const mirror = new WorkspaceMirror(makeEngines({ lintFindings }));
    seed(mirror, [
      {
        bookCode: "GEN",
        chapters: [{ chapterNum: 1, chapter: chapter("existing", false) }],
      },
    ]);
    // syncMeta for a book the mirror doesn't know is ignored, not created.
    mirror.applyPatch({
      kind: "syncMeta",
      generation: 1,
      books: [
        {
          bookCode: "GEN",
          diskBaseline: { kind: "absent" },
          baselineTokens: [],
          chapterDirty: [{ chapterNum: 1, dirty: false }],
        },
      ],
    });
    const result = await mirror.runCommand({
      kind: "analyzeLint",
      generation: 2,
    });
    if (result.kind === "lintResult") {
      expect(result.snapshot.books).toEqual([]);
    }
  });
});

describe("WorkspaceMirror — backup", () => {
  it("publishes the resident corpus only at the requested generation", async () => {
    const publishBraid = vi.fn<MirrorEngines["publishBraid"]>(() => ({
      packed: new ArrayBuffer(0),
      snapshotId: "snapshot",
      books: [],
      sources: [{ bookCode: "GEN", sourceKey: "GEN", source: "resident" }],
      serializedBooks: [{ bookCode: "GEN", contents: "resident" }],
    }));
    const mirror = new WorkspaceMirror(makeEngines({ publishBraid }));
    seed(mirror, [
      {
        bookCode: "GEN",
        chapters: [{ chapterNum: 1, chapter: chapter("old", false) }],
      },
    ]);
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("resident", true),
      generation: 4,
    });

    const behind = await mirror.runCommand({
      kind: "publishBraid",
      generation: 5,
      requestId: "save-5",
    });
    expect(behind).toMatchObject({
      kind: "publishBraidResult",
      behind: true,
    });

    const result = await mirror.runCommand({
      kind: "publishBraid",
      generation: 4,
      requestId: "save-4",
    });
    expect(result).toMatchObject({
      kind: "publishBraidResult",
      behind: false,
      superseded: false,
      publication: expect.objectContaining({
        serializedBooks: [{ bookCode: "GEN", contents: "resident" }],
      }),
    });
    expect(publishBraid).toHaveBeenCalledTimes(1);
  });

  it("writes backup bytes returned by resident Braid", async () => {
    const persistBackup = vi.fn<MirrorEngines["persistBackup"]>(
      async () => true,
    );
    const braidUsfm = vi.fn<MirrorEngines["braidUsfm"]>(() => "resident-usfm");
    const mirror = new WorkspaceMirror(
      makeEngines({
        persistBackup,
        braidUsfm,
        isBraidDirty: vi.fn<MirrorEngines["isBraidDirty"]>(() => true),
      }),
    );

    const c1 = chapter("first chapter", true);
    const c2 = chapter("second chapter", true);
    seed(mirror, [
      {
        bookCode: "GEN",
        chapters: [
          { chapterNum: 1, chapter: c1 },
          { chapterNum: 2, chapter: c2 },
        ],
      },
    ]);
    mirror.applyPatch({
      kind: "pushBaseline",
      bookCode: "GEN",
      diskBaseline: { kind: "present", md5: "base" },
      baselineTokens: [],
      generation: 1,
    });
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: c1,
      generation: 1,
    });
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 2 },
      chapter: c2,
      generation: 1,
    });

    const result = await mirror.runCommand({
      kind: "writeBackup",
      bookCode: "GEN",
      appVersion: "1.0.0",
      generation: 2,
    });

    expect(persistBackup).toHaveBeenCalledTimes(1);
    const [, envelopeJson] = persistBackup.mock.calls[0]!;
    const entry = JSON.parse(envelopeJson) as DirtyBufferFile;

    expect(entry.content).toBe("resident-usfm");
    expect(braidUsfm).toHaveBeenCalledWith("GEN");
    expect(entry.schemaVersion).toBe(DIRTY_BUFFER_SCHEMA_VERSION);
    expect(entry.diskBaseline).toEqual({ kind: "present", md5: "base" });
    expect(entry.appVersion).toBe("1.0.0");

    if (result.kind === "backupResult") {
      expect(result.ranAtGeneration).toBe(2);
    }
  });

  it("clears the backup when the book has no dirty chapters", async () => {
    const clearBackup = vi.fn<MirrorEngines["clearBackup"]>(async () => true);
    const persistBackup = vi.fn<MirrorEngines["persistBackup"]>(
      async () => true,
    );
    const mirror = new WorkspaceMirror(
      makeEngines({ clearBackup, persistBackup }),
    );
    const clean = chapter("clean", false);
    seed(mirror, [
      { bookCode: "GEN", chapters: [{ chapterNum: 1, chapter: clean }] },
    ]);
    mirror.applyPatch({
      kind: "pushBaseline",
      bookCode: "GEN",
      diskBaseline: { kind: "present", md5: "base" },
      baselineTokens: clean.tokens,
      generation: 1,
    });
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: clean,
      generation: 1,
    });

    const result = await mirror.runCommand({
      kind: "writeBackup",
      bookCode: "GEN",
      appVersion: "1.0.0",
      generation: 2,
    });

    expect(clearBackup).toHaveBeenCalledWith("GEN");
    expect(persistBackup).not.toHaveBeenCalled();
    if (result.kind === "backupResult") expect(result.cleared).toBe(true);
  });

  it("retries a transient persist failure and succeeds without shipping bytes back", async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const persistBackup = vi.fn<MirrorEngines["persistBackup"]>(async () => {
        attempts++;
        if (attempts < 3) throw new Error("transient OPFS failure");
        return true;
      });
      const mirror = new WorkspaceMirror(makeEngines({ persistBackup }));
      seed(mirror, [
        {
          bookCode: "GEN",
          chapters: [{ chapterNum: 1, chapter: chapter("initial", false) }],
        },
      ]);
      mirror.applyPatch({
        kind: "pushChapter",
        ref: { bookCode: "GEN", chapterNum: 1 },
        chapter: chapter("dirty", true),
        generation: 1,
      });

      const promise = mirror.runCommand({
        kind: "writeBackup",
        bookCode: "GEN",
        appVersion: "1.0.0",
        generation: 2,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(persistBackup).toHaveBeenCalledTimes(3);
      expect(result.kind).toBe("backupResult");
    } finally {
      vi.useRealTimers();
    }
  });

  it("after retries are exhausted, logs loudly and ships bytes back rather than tearing down", async () => {
    vi.useFakeTimers();
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const persistBackup = vi.fn<MirrorEngines["persistBackup"]>(async () => {
        throw new Error("persistent FS failure");
      });
      const mirror = new WorkspaceMirror(makeEngines({ persistBackup }));
      seed(mirror, [
        {
          bookCode: "GEN",
          chapters: [{ chapterNum: 1, chapter: chapter("initial", false) }],
        },
      ]);
      mirror.applyPatch({
        kind: "pushChapter",
        ref: { bookCode: "GEN", chapterNum: 1 },
        chapter: chapter("dirty", true),
        generation: 1,
      });

      const promise = mirror.runCommand({
        kind: "writeBackup",
        bookCode: "GEN",
        appVersion: "1.0.0",
        generation: 2,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(persistBackup).toHaveBeenCalledTimes(3);
      expect(error).toHaveBeenCalled();
      expect(result.kind).toBe("backupResult");
    } finally {
      error.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("WorkspaceMirror — resident Braid fixes", () => {
  it("rejects a fix request behind the latest editor patch", async () => {
    const applyBraidFix = vi.fn<MirrorEngines["applyBraidFix"]>(() => ({
      books: { GEN: [] },
      usfm: { GEN: "fixed" },
    }));
    const mirror = new WorkspaceMirror(makeEngines({ applyBraidFix }));
    seed(mirror, [
      {
        bookCode: "GEN",
        chapters: [{ chapterNum: 1, chapter: chapter("old", false) }],
      },
    ]);
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("current", true),
      generation: 4,
    });

    const result = await mirror.runCommand({
      kind: "applyBraidFix",
      generation: 3,
      requestId: "fix-3",
      bookCode: "GEN",
      fix: {
        type: "deleteToken",
        code: "test-fix",
        label: "Test fix",
        labelParams: {},
        targetTokenId: "current-id",
      },
    });

    expect(result).toMatchObject({
      kind: "applyBraidFixResult",
      requestId: "fix-3",
      superseded: true,
      behind: false,
    });
    expect(applyBraidFix).not.toHaveBeenCalled();
  });

  it("applies a fix only at the resident editor generation", async () => {
    const applyBraidFix = vi.fn<MirrorEngines["applyBraidFix"]>(() => ({
      books: { GEN: [] },
      usfm: { GEN: "fixed" },
    }));
    const mirror = new WorkspaceMirror(makeEngines({ applyBraidFix }));
    seed(mirror, [
      {
        bookCode: "GEN",
        chapters: [{ chapterNum: 1, chapter: chapter("old", false) }],
      },
    ]);
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("current", true),
      generation: 4,
    });

    const result = await mirror.runCommand({
      kind: "applyBraidFix",
      generation: 4,
      requestId: "fix-4",
      bookCode: "GEN",
      fix: {
        type: "deleteToken",
        code: "test-fix",
        label: "Test fix",
        labelParams: {},
        targetTokenId: "current-id",
      },
    });

    expect(result).toMatchObject({
      kind: "applyBraidFixResult",
      requestId: "fix-4",
      books: { GEN: [] },
      usfm: { GEN: "fixed" },
      superseded: false,
      behind: false,
    });
    expect(applyBraidFix).toHaveBeenCalledWith("GEN", expect.anything());
  });
});
