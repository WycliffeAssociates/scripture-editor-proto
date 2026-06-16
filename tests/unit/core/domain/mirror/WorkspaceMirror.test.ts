// WorkspaceMirror.test.ts
//
// Protocol-level tests for the mirror state machine. No Worker, no DOM — the
// mirror is a plain module, so we drive it with patches/commands directly and
// assert on resident-state behavior, generation tagging, and the HARD backup
// byte-identity invariant (backup bytes === serializeChaptersToUsfm over the
// same chapters).

import { makeTokens } from "@tests/helpers/workspaceFixtures.ts";
import { describe, expect, it, vi } from "vitest";

import { serializeChaptersToUsfm } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
  MirrorChapter,
  MirrorPatch,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import {
  type MirrorEngines,
  WorkspaceMirror,
} from "@/app/domain/mirror/WorkspaceMirror.ts";
import {
  DIRTY_BUFFER_SCHEMA_VERSION,
  type DirtyBufferFile,
} from "@/app/state/DirtyBufferStore.ts";

function makeEngines(overrides?: Partial<MirrorEngines>): MirrorEngines {
  return {
    lintBook: vi.fn<MirrorEngines["lintBook"]>(async () => []),
    analyzeSousBook: vi.fn<MirrorEngines["analyzeSousBook"]>(async () => ({
      segments: {},
      findings: [],
    })),
    computeMd5: vi.fn<MirrorEngines["computeMd5"]>(
      async (content: string) => `md5(${content.length})`,
    ),
    persistBackup: vi.fn<MirrorEngines["persistBackup"]>(async () => true),
    clearBackup: vi.fn<MirrorEngines["clearBackup"]>(async () => true),
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

describe("WorkspaceMirror — patches", () => {
  it("applies pushChapter and assembles book tokens for analyze", async () => {
    const lintBook = vi.fn<MirrorEngines["lintBook"]>(async () => []);
    const mirror = new WorkspaceMirror(makeEngines({ lintBook }));

    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("hello", true),
      generation: 1,
    });

    const result = await mirror.runCommand({
      kind: "analyzeLint",
      scope: { books: ["GEN"] },
      generation: 2,
    });

    expect(result.kind).toBe("lintResult");
    expect(lintBook).toHaveBeenCalledTimes(1);
    expect(lintBook.mock.calls[0]?.[0]).toHaveLength(1);
    if (result.kind === "lintResult") {
      expect(result.ranAtGeneration).toBe(2);
      expect(Object.keys(result.byBook)).toEqual(["GEN"]);
    }
  });

  it("echoes the analyze command's requestId on the result", async () => {
    const mirror = new WorkspaceMirror(makeEngines());
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("hi", true),
      generation: 1,
    });
    const lint = await mirror.runCommand({
      kind: "analyzeLint",
      scope: "all",
      generation: 2,
      requestId: "initial-lint-2",
    });
    const sous = await mirror.runCommand({
      kind: "analyzeSous",
      scope: "all",
      generation: 2,
      requestId: "initial-sous-2",
    });
    expect(lint.kind === "lintResult" && lint.requestId).toBe("initial-lint-2");
    expect(sous.kind === "sousResult" && sous.requestId).toBe("initial-sous-2");
  });

  it("drops a stale pushChapter (older generation is a no-op)", async () => {
    const persistBackup = vi.fn<MirrorEngines["persistBackup"]>(
      async () => true,
    );
    const mirror = new WorkspaceMirror(makeEngines({ persistBackup }));

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
    const lintBook = vi.fn<MirrorEngines["lintBook"]>(async () => []);
    const mirror = new WorkspaceMirror(makeEngines({ lintBook }));
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
      scope: "all",
      generation: 3,
    });
    if (result.kind === "lintResult") {
      expect(Object.keys(result.byBook)).toEqual([]);
    }
    expect(lintBook).not.toHaveBeenCalled();
  });

  it("fullSync replaces the whole mirror — vanished books are dropped", async () => {
    const mirror = new WorkspaceMirror(makeEngines());
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
          chapters: [{ chapterNum: 1, chapter: chapter("gen", true) }],
        },
      ],
    };
    mirror.applyPatch(sync);

    const result = await mirror.runCommand({
      kind: "analyzeLint",
      scope: "all",
      generation: 3,
    });
    if (result.kind === "lintResult") {
      expect(Object.keys(result.byBook)).toEqual(["GEN"]);
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
    mirror.applyPatch({
      kind: "pushBaseline",
      bookCode: "GEN",
      diskBaseline: { kind: "present", md5: "old" },
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
    const expectedContent = serializeChaptersToUsfm(
      [
        { chapterNumber: 1, eol: c1.eol, currentTokens: c1.tokens },
        { chapterNumber: 2, eol: c2.eol, currentTokens: c2.tokens },
      ],
      (chapterState) => chapterState.currentTokens,
    );

    // The clean-mark: dirty flags clear, baseline advances, no tokens.
    mirror.applyPatch({
      kind: "syncMeta",
      generation: 2,
      books: [
        {
          bookCode: "GEN",
          diskBaseline: { kind: "present", md5: "new" },
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

    // Re-dirty chapter 1 only (metadata) and confirm tokens + advanced baseline
    // survived the syncMeta: the backup is byte-identical and carries md5 "new".
    mirror.applyPatch({
      kind: "syncMeta",
      generation: 4,
      books: [
        {
          bookCode: "GEN",
          diskBaseline: { kind: "present", md5: "new" },
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
    expect(persistBackup).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(
      persistBackup.mock.calls[0]![1],
    ) as DirtyBufferFile;
    expect(entry.content).toBe(expectedContent);
    expect(entry.diskBaseline).toEqual({ kind: "present", md5: "new" });
  });

  it("syncMeta never adds books or chapters the mirror does not hold", async () => {
    const lintBook = vi.fn<MirrorEngines["lintBook"]>(async () => []);
    const mirror = new WorkspaceMirror(makeEngines({ lintBook }));
    // syncMeta for a book the mirror doesn't know is ignored, not created.
    mirror.applyPatch({
      kind: "syncMeta",
      generation: 1,
      books: [
        {
          bookCode: "GEN",
          diskBaseline: { kind: "absent" },
          chapterDirty: [{ chapterNum: 1, dirty: false }],
        },
      ],
    });
    const result = await mirror.runCommand({
      kind: "analyzeLint",
      scope: "all",
      generation: 2,
    });
    if (result.kind === "lintResult") {
      expect(Object.keys(result.byBook)).toEqual([]);
    }
  });
});

describe("WorkspaceMirror — backup", () => {
  it("writes a backup byte-identical to serializeChaptersToUsfm", async () => {
    const persistBackup = vi.fn<MirrorEngines["persistBackup"]>(
      async () => true,
    );
    const mirror = new WorkspaceMirror(makeEngines({ persistBackup }));

    const c1 = chapter("first chapter", true);
    const c2 = chapter("second chapter", true);
    mirror.applyPatch({
      kind: "pushBaseline",
      bookCode: "GEN",
      diskBaseline: { kind: "present", md5: "base" },
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

    // The invariant: identical to a real save over the same chapters.
    const expected = serializeChaptersToUsfm(
      [
        { chapterNumber: 1, eol: c1.eol, currentTokens: c1.tokens },
        { chapterNumber: 2, eol: c2.eol, currentTokens: c2.tokens },
      ],
      (chapterState) => chapterState.currentTokens,
    );
    expect(entry.content).toBe(expected);
    expect(entry.schemaVersion).toBe(DIRTY_BUFFER_SCHEMA_VERSION);
    expect(entry.diskBaseline).toEqual({ kind: "present", md5: "base" });
    expect(entry.appVersion).toBe("1.0.0");

    if (result.kind === "backupResult") {
      expect(result.ranAtGeneration).toBe(2);
      // Web persisted itself — no envelope shipped back.
      expect(result.envelopeJson).toBeUndefined();
    }
  });

  it("ships envelope bytes back when the host cannot persist (desktop interim)", async () => {
    const persistBackup = vi.fn<MirrorEngines["persistBackup"]>(
      async () => false,
    );
    const mirror = new WorkspaceMirror(makeEngines({ persistBackup }));
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("dirty", true),
      generation: 1,
    });

    const result = await mirror.runCommand({
      kind: "writeBackup",
      bookCode: "GEN",
      appVersion: "1.0.0",
      generation: 2,
    });

    if (result.kind === "backupResult") {
      expect(result.envelopeJson).toBeDefined();
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
    mirror.applyPatch({
      kind: "pushChapter",
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: chapter("clean", false),
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
      if (result.kind === "backupResult") {
        // Persisted on retry → no envelope shipped back, nothing torn down.
        expect(result.envelopeJson).toBeUndefined();
      }
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
      if (result.kind === "backupResult") {
        // The book stays covered for a desktop main-write fallback; never crashes.
        expect(result.envelopeJson).toBeDefined();
      }
    } finally {
      error.mockRestore();
      vi.useRealTimers();
    }
  });
});
