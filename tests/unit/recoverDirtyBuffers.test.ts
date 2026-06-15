// recoverDirtyBuffers.test.ts
//
// Recovery classification + layering correctness — the 6-row matrix. A real
// DirtyBufferStore (InMemoryFileSystem) and real WorkspaceBaselineStore /
// RecoveredConflictTracker are used; only the USFM parser is stubbed to a
// single bare text token (which SID normalization anchors to chapter 0) so the
// focus stays on classification, not parsing.

import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { makeChapter } from "@tests/helpers/workspaceFixtures.ts";
import { describe, expect, it, vi } from "vitest";

import type { EditorShape } from "@/app/data/editor.ts";
import { recoverDirtyBuffers } from "@/app/domain/api/recoverDirtyBuffers.ts";
import {
  buildBooksSavePayload,
  revertChapterToLoadedState,
} from "@/app/domain/project/saveAndRevertService.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import {
  type DirtyBufferFile,
  DIRTY_BUFFER_SCHEMA_VERSION,
  type DiskBaseline,
  DirtyBufferStore,
} from "@/app/state/DirtyBufferStore.ts";
import { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

const ROOT = "/appData/dirty-buffers";
const WS = "demo";
const identityMd5: IMd5Service = { calculateMd5: async (t: string) => t };

// Stub parser: each content string becomes one chapter-5 text token (sid drives
// groupFlatTokensByChapter); lintScope returns no issues.
const usfmOnionService = {
  parseUsfmBatchFromContents: async (contents: string[]) =>
    contents.map((content) => ({
      tokens: [
        {
          id: "t",
          kind: "text",
          sid: "GEN 1:1",
          source: content,
          span: { start: 0, end: content.length },
        },
      ],
      lintIssues: [],
    })),
  lintScope: async (scopes: unknown[]) => scopes.map(() => []),
  supportsPathIo: false,
} as unknown as IUsfmOnionService;

function diskGen(sourceText: string): ScriptureBookState {
  const chapter: ScriptureChapterState = makeChapter({
    bookCode: "GEN",
    chapterNumber: 0,
    text: sourceText,
    sourceText, // clean: current == source == disk
  });
  return {
    path: "/userData/projects/demo/GEN.usfm",
    title: "Genesis",
    bookCode: "GEN",
    nextBookId: null,
    prevBookId: null,
    chapters: [chapter],
  };
}

// Two-chapter disk book (chapter 0 + chapter 1). Used by the recovered-deletion
// cases: the stub parser only ever yields chapter 0, so chapter 1 is "absent
// from the backup" (i.e. the user deleted it). Whole-book baseline = "DISK0DISK1".
function diskGenTwoChapters(): ScriptureBookState {
  return {
    path: "/userData/projects/demo/GEN.usfm",
    title: "Genesis",
    bookCode: "GEN",
    nextBookId: null,
    prevBookId: null,
    chapters: [
      makeChapter({
        bookCode: "GEN",
        chapterNumber: 0,
        text: "DISK0",
        sourceText: "DISK0",
      }),
      makeChapter({
        bookCode: "GEN",
        chapterNumber: 1,
        text: "DISK1",
        sourceText: "DISK1",
      }),
    ],
  };
}

function backup(content: string, diskBaseline: DiskBaseline): DirtyBufferFile {
  return {
    schemaVersion: DIRTY_BUFFER_SCHEMA_VERSION,
    diskBaseline,
    bodyMd5: content, // identity md5
    writtenAt: 0,
    appVersion: "test",
    content,
  };
}

async function runRecovery(opts: {
  parsedFiles: ScriptureBookState[];
  backups: Array<{ bookCode: string; entry: DirtyBufferFile }>;
  rawBackups?: Array<{ bookCode: string; raw: string }>;
}) {
  const fs = new InMemoryFileSystem();
  const store = new DirtyBufferStore(fs, identityMd5, ROOT);
  const clearSpy = vi.spyOn(store, "clear");
  for (const b of opts.backups) await store.put(WS, b.bookCode, b.entry);
  for (const r of opts.rawBackups ?? [])
    await fs.atomicWriteText(`${ROOT}/${WS}/${r.bookCode}.json`, r.raw);

  // The loader hashes each book's real disk bytes; here the stub parser maps a
  // content string to one token whose source is that string, so a book's disk
  // bytes are its joined source tokens. identityMd5 returns the input.
  const diskMd5ByBook = new Map<string, string>();
  for (const book of opts.parsedFiles) {
    const joined = book.chapters
      .map((chapter) =>
        chapter.sourceTokens.map((token) => token.source).join(""),
      )
      .join("");
    diskMd5ByBook.set(book.bookCode, await identityMd5.calculateMd5(joined));
  }

  const tracker = new RecoveredConflictTracker();
  const result = await recoverDirtyBuffers({
    parsedFiles: opts.parsedFiles,
    diskMd5ByBook,
    dirtyBufferStore: store,
    workspaceBaselineStore: new WorkspaceBaselineStore(identityMd5),
    recoveredConflictTracker: tracker,
    workspaceKey: WS,
    direction: "ltr",
    shape: "regular" as EditorShape,
    usfmOnionService,
  });
  return { result, tracker, clearSpy };
}

function restoredChapter(
  files: ScriptureBookState[],
  bookCode: string,
  chapterNum: number,
): ScriptureChapterState | undefined {
  return files
    .find((f) => f.bookCode === bookCode)
    ?.chapters.find((c) => c.chapterNumber === chapterNum);
}

describe("recoverDirtyBuffers classification", () => {
  it("baseline match + content differs → restore as dirty, NO forced review", async () => {
    const { result, tracker } = await runRecovery({
      parsedFiles: [diskGen("DISK")],
      backups: [
        {
          bookCode: "GEN",
          entry: backup("EDITED", { kind: "present", md5: "DISK" }),
        },
      ],
    });

    expect(result.restoredBookCodes).toEqual(["GEN"]);
    // Matched baseline → no conflict surfaced to the banner either.
    expect(result.conflictedBookCodes).toEqual([]);
    expect(tracker.isEmpty()).toBe(true); // match → no conflict to review
    const chapter = restoredChapter(result.parsedFiles, "GEN", 0);
    expect(chapter?.dirty).toBe(true);
    expect(chapter?.currentTokens.map((t) => t.source).join("")).toBe("EDITED");
  });

  it("baseline mismatch (disk moved) → restore AND track for forced review", async () => {
    const { result, tracker } = await runRecovery({
      parsedFiles: [diskGen("DISK")],
      backups: [
        {
          bookCode: "GEN",
          entry: backup("EDITED", { kind: "present", md5: "OLD-DISK" }),
        },
      ],
    });

    expect(result.restoredBookCodes).toEqual(["GEN"]);
    // The disk moved → surface "disk changed since your edits" in the banner.
    expect(result.conflictedBookCodes).toEqual(["GEN"]);
    expect(tracker.has("GEN", 0)).toBe(true);
  });

  it("absent baseline + book present on disk → restore + track (mismatch)", async () => {
    const { result, tracker } = await runRecovery({
      parsedFiles: [diskGen("DISK")],
      backups: [
        { bookCode: "GEN", entry: backup("EDITED", { kind: "absent" }) },
      ],
    });
    expect(result.restoredBookCodes).toEqual(["GEN"]);
    expect(result.conflictedBookCodes).toEqual(["GEN"]);
    expect(tracker.has("GEN", 0)).toBe(true);
  });

  it("stale residue (backup equals disk) → clear backup, no banner, no restore", async () => {
    const { result, tracker, clearSpy } = await runRecovery({
      parsedFiles: [diskGen("DISK")],
      backups: [
        {
          bookCode: "GEN",
          entry: backup("DISK", { kind: "present", md5: "DISK" }),
        },
      ],
    });
    expect(result.restoredBookCodes).toEqual([]);
    expect(tracker.isEmpty()).toBe(true);
    expect(clearSpy).toHaveBeenCalledWith(WS, "GEN");
  });

  it("present baseline + book gone from disk → manual-recovery (disk-book-missing)", async () => {
    const { result } = await runRecovery({
      parsedFiles: [diskGen("DISK")], // only GEN on disk
      backups: [
        {
          bookCode: "EXO",
          entry: backup("WORK", { kind: "present", md5: "X" }),
        },
      ],
    });
    expect(result.restoredBookCodes).toEqual([]);
    expect(result.recoveryReportEntries).toEqual([
      expect.objectContaining({
        kind: "manual-recovery",
        subKind: "disk-book-missing",
        bookCode: "EXO",
      }),
    ]);
  });

  it("absent baseline + book absent on disk → manual-recovery (new-book-not-supported)", async () => {
    const { result } = await runRecovery({
      parsedFiles: [diskGen("DISK")],
      backups: [
        { bookCode: "LEV", entry: backup("NEW BOOK", { kind: "absent" }) },
      ],
    });
    expect(result.recoveryReportEntries).toEqual([
      expect.objectContaining({
        kind: "manual-recovery",
        subKind: "new-book-not-supported",
        bookCode: "LEV",
      }),
    ]);
  });

  it("recovered deletion (disk chapter absent from backup): restored cleared+dirty over disk baseline, no forced review on match", async () => {
    const { result, tracker } = await runRecovery({
      parsedFiles: [diskGenTwoChapters()],
      backups: [
        {
          bookCode: "GEN",
          entry: backup("EDITED", {
            kind: "present",
            md5: "DISK0DISK1",
          }),
        },
      ],
    });

    expect(result.restoredBookCodes).toEqual(["GEN"]);
    const cleared = restoredChapter(result.parsedFiles, "GEN", 1);
    expect(cleared?.dirty).toBe(true);
    // current content empty (deletion) but baseline stays the disk chapter
    expect(cleared?.currentTokens).toEqual([]);
    expect(cleared?.sourceTokens.map((t) => t.source).join("")).toBe("DISK1");
    // Baseline matched (disk didn't move) → the deletion is the user's own
    // unsaved work; no forced review.
    expect(tracker.isEmpty()).toBe(true);
  });

  it("recovered deletion on a baseline-mismatch book is tracked for forced review", async () => {
    const { tracker } = await runRecovery({
      parsedFiles: [diskGenTwoChapters()],
      backups: [
        // Disk moved underneath the backup → mismatch.
        {
          bookCode: "GEN",
          entry: backup("EDITED", {
            kind: "present",
            md5: "OLD-DISK",
          }),
        },
      ],
    });
    // The removed chapter (1) is exactly what an external disk change might
    // touch, so it must force review.
    expect(tracker.has("GEN", 1)).toBe(true);
  });

  it("Discard restores a recovered-deleted chapter to its disk content", async () => {
    const { result } = await runRecovery({
      parsedFiles: [diskGenTwoChapters()],
      backups: [
        {
          bookCode: "GEN",
          entry: backup("EDITED", {
            kind: "present",
            md5: "DISK0DISK1",
          }),
        },
      ],
    });
    const cleared = restoredChapter(result.parsedFiles, "GEN", 1);
    if (!cleared) throw new Error("expected recovered chapter 1");
    // Discard = revert to the loaded (disk) baseline.
    revertChapterToLoadedState(cleared);
    expect(cleared.currentTokens.map((t) => t.source).join("")).toBe("DISK1");
    expect(cleared.dirty).toBe(false);
  });

  it("Save serializes a recovered-deleted chapter as nothing (no empty marker)", async () => {
    const { result } = await runRecovery({
      parsedFiles: [diskGenTwoChapters()],
      backups: [
        {
          bookCode: "GEN",
          entry: backup("EDITED", {
            kind: "present",
            md5: "DISK0DISK1",
          }),
        },
      ],
    });
    const book = result.parsedFiles.find((f) => f.bookCode === "GEN");
    if (!book) throw new Error("expected GEN");
    const payload = buildBooksSavePayload([book]);
    // chapter 0 = "EDITED", deleted chapter 1 contributes "" — its disk
    // content is gone and no placeholder marker is written.
    expect(payload.GEN).toBe("EDITED");
    expect(payload.GEN).not.toContain("DISK1");
  });

  it("unreadable backup → backup-unreadable report, project still opens", async () => {
    const { result } = await runRecovery({
      parsedFiles: [diskGen("DISK")],
      backups: [],
      rawBackups: [{ bookCode: "GEN", raw: "{ corrupt" }],
    });
    expect(result.restoredBookCodes).toEqual([]);
    expect(result.recoveryReportEntries).toEqual([
      expect.objectContaining({
        kind: "backup-unreadable",
        reason: "json-parse",
      }),
    ]);
  });
});
