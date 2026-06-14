// recoverDirtyBuffers.ts
//
// Reopen-time crash recovery. Given the freshly-loaded (clean) project state and
// the per-book dirty-buffer backups on disk, this:
//   1. records the current on-disk baseline (MD5) for every loaded book,
//   2. classifies each backup against that baseline (the 6-row matrix below),
//   3. layers genuine restoration candidates back in as the user's latest
//      working state (dirty), and
//   4. seeds the RecoveredConflictTracker for chapters whose disk baseline moved
//      underneath the backup (so the first save is forced through review).
//
// Backups that can't be read/parsed, or that describe a book not on current disk,
// don't abort the reopen — they become recovery-report entries the banner shows.
//
// Classification matrix (backup.diskBaseline × current disk):
//   unreadable      | n/a           -> report: backup-unreadable
//   absent          | absent        -> report: manual-recovery / new-book-not-supported
//   absent          | present       -> restore (baseline mismatch -> tracker)
//   present(X)      | absent        -> report: manual-recovery / disk-book-missing
//   present(X)      | present(X)    -> restore (baseline match -> no tracker)
//   present(X)      | present(Y!=X) -> restore (baseline mismatch -> tracker)

import type { EditorShape } from "@/app/data/editor.ts";
import { parseRecoveredBookContents } from "@/app/domain/api/parseRecoveredBookContents.ts";
import type { InitialLintByBook } from "@/app/domain/api/scriptureProjectToParsedFiles.ts";
import {
  detectLineEnding,
  tokensToLexical,
  tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { mergeBookChapters } from "@/app/domain/project/workingFileMutations.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type {
  DirtyBufferStore,
  ReadUnreadableReason,
} from "@/app/state/DirtyBufferStore.ts";
import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import { relintBookFiles } from "@/app/ui/hooks/linting.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

export type RecoveryReportEntry =
  | {
      kind: "backup-unreadable";
      reason: ReadUnreadableReason;
      message: string;
      path: string;
    }
  | {
      kind: "usfm-parse-error";
      message: string;
      path: string;
      bookCode: string;
    }
  | {
      kind: "manual-recovery";
      subKind: "new-book-not-supported" | "disk-book-missing";
      bookCode: string;
      path: string;
    };

export type RecoveryResult = {
  parsedFiles: ScriptureBookState[];
  restoredBookCodes: string[];
  /**
   * Subset of `restoredBookCodes` whose recorded disk baseline didn't match
   * current disk (i.e. the file moved underneath the backup). Identical to
   * the set of books that seeded the `RecoveredConflictTracker`. The banner
   * uses this to add a "disk changed since your edits" notice; behavior is
   * unchanged — the layered work is kept regardless, this is purely
   * surfacing the signal.
   */
  conflictedBookCodes: string[];
  recoveryReportEntries: RecoveryReportEntry[];
  initialLintErrorsByBook: InitialLintByBook;
};

export async function recoverDirtyBuffers(args: {
  parsedFiles: ScriptureBookState[];
  /**
   * md5 of each loaded book's actual on-disk bytes, computed by the loader.
   * The baseline against which a backup's recorded `diskBaseline` is compared
   * to detect "disk moved underneath this backup". Hashing real bytes (rather
   * than re-serialized tokens) is exact and round-trip-safe; see the loader.
   */
  diskMd5ByBook: ReadonlyMap<string, string>;
  dirtyBufferStore: DirtyBufferStore;
  workspaceBaselineStore: WorkspaceBaselineStore;
  recoveredConflictTracker: RecoveredConflictTracker;
  workspaceKey: string;
  direction: LanguageDirection;
  /** The `mainEditor` shape (see `shapeForSurface`). */
  shape: EditorShape;
  usfmOnionService: IUsfmOnionService;
  initialLintErrorsByBook: InitialLintByBook;
}): Promise<RecoveryResult> {
  const {
    workspaceBaselineStore,
    recoveredConflictTracker,
    dirtyBufferStore,
    workspaceKey,
  } = args;

  // 1. Record on-disk baselines from the loader-supplied hashes (md5 of the
  //    real disk bytes). The pipeline reads these when it later writes a
  //    backup, and the classification below compares each backup's recorded
  //    baseline against them.
  const booksByCode = new Map(
    args.parsedFiles.map((book) => [book.bookCode, book]),
  );
  for (const book of args.parsedFiles) {
    const md5 = args.diskMd5ByBook.get(book.bookCode);
    if (md5 !== undefined) {
      workspaceBaselineStore.setPresent(book.bookCode, md5);
    }
  }

  const backups = await dirtyBufferStore.list(workspaceKey);
  const recoveryReportEntries: RecoveryReportEntry[] = [];
  const restoredBookCodes = new Set<string>();
  const conflictedBookCodes = new Set<string>();
  // Per-book layered chapter replacements, applied after classification.
  const layeredChaptersByBook = new Map<
    string,
    Map<number, ScriptureChapterState>
  >();

  for (const backup of backups) {
    const { bookCode, path, result } = backup;
    if (result.kind === "missing") continue;
    if (result.kind === "unreadable") {
      recoveryReportEntries.push({
        kind: "backup-unreadable",
        reason: result.reason,
        message: result.message,
        path: result.path,
      });
      continue;
    }

    const backupBaseline = result.entry.diskBaseline;
    const currentDisk = workspaceBaselineStore.getBaseline(bookCode);
    const diskBook = booksByCode.get(bookCode);

    // Only a book that isn't on disk at all (not in the parsed project) is
    // un-restorable — that's the `diskBook` test, NOT baseline presence. A
    // loaded book whose baseline we happen to lack (e.g. no `sourceMd5` from
    // an older desktop build, or a read error) is still on disk and must be
    // restored — it just can't be compared, so it falls to forced review
    // below. Conflating "no baseline" with "not on disk" here is what made
    // on-disk books misreport as un-restorable new books.
    if (!diskBook) {
      recoveryReportEntries.push({
        kind: "manual-recovery",
        subKind:
          backupBaseline.kind === "absent"
            ? "new-book-not-supported"
            : "disk-book-missing",
        bookCode,
        path,
      });
      continue;
    }

    // No baseline to compare against → treat as changed (forced review),
    // the safe default when md5 is unavailable.
    const baselineMismatch =
      currentDisk.kind === "absent" ||
      backupBaseline.kind === "absent" ||
      backupBaseline.md5 !== currentDisk.md5;

    let restoredChapters: Awaited<
      ReturnType<typeof parseRecoveredBookContents>
    >;
    try {
      restoredChapters = await parseRecoveredBookContents({
        bookCode,
        content: result.entry.content,
        direction: args.direction,
        shape: args.shape,
        usfmOnionService: args.usfmOnionService,
      });
    } catch (error) {
      recoveryReportEntries.push({
        kind: "usfm-parse-error",
        message: error instanceof Error ? error.message : String(error),
        path,
        bookCode,
      });
      continue;
    }

    const diskChaptersByNum = new Map(
      diskBook.chapters.map((chapter) => [chapter.chapterNumber, chapter]),
    );

    // Stale-residue check: a backup that exactly equals disk (e.g. a
    // save-then-clear that failed to clear) is just residue. Drop it,
    // no banner.
    const differingChapters: Array<{
      chapterNum: number;
      chapter: ScriptureChapterState;
    }> = [];
    for (const [chapterNum, restored] of restoredChapters) {
      const diskChapter = diskChaptersByNum.get(chapterNum);
      // Compare both sides under one EOL convention (disk's if known, else
      // the restored buffer's) so a pure CRLF/LF difference never reads as
      // real content drift in the stale-residue check.
      const eol = diskChapter?.eol ?? detectLineEnding(restored.tokens);
      const restoredSource = tokensToUsfm(restored.tokens, eol);
      const diskSource = diskChapter
        ? tokensToUsfm(diskChapter.sourceTokens, eol)
        : null;
      if (diskSource !== null && restoredSource === diskSource) {
        continue; // matches disk — nothing to restore for this chapter
      }
      // Layer the restored content as a dirty edit over the disk baseline.
      // New-to-disk chapters get an empty baseline so dirty derives true.
      const layered: ScriptureChapterState = diskChapter
        ? {
            ...diskChapter,
            currentTokens: restored.tokens,
            lexicalState: restored.lexicalState,
            dirty: true,
          }
        : {
            chapterNumber: chapterNum,
            sourceTokens: [],
            currentTokens: restored.tokens,
            lexicalState: restored.lexicalState,
            direction: args.direction,
            dirty: true,
            eol,
          };
      differingChapters.push({ chapterNum, chapter: layered });
    }

    // Recovered deletion: a chapter present on disk but ABSENT from the
    // whole-book backup was removed/cleared in the user's latest working
    // state. The merge above would otherwise silently keep the disk version
    // (data loss). The per-chapter dirty model has no "removed chapter slot",
    // so represent the deletion as a dirty chapter whose baseline stays the
    // DISK content (sourceTokens / loadedLexicalState via `...diskChapter`)
    // but whose current content is empty. That keeps both states the
    // save/review machinery needs: Discard restores the disk chapter and
    // diffs show a deletion; Save serializes nothing for it (verified:
    // `buildBooksSavePayload` joins token sources, and empty currentTokens
    // contribute "" — no empty chapter marker is written). This is distinct
    // from the new-to-disk branch above, which has no disk baseline.
    for (const diskChapter of diskBook.chapters) {
      if (restoredChapters.has(diskChapter.chapterNumber)) continue;
      differingChapters.push({
        chapterNum: diskChapter.chapterNumber,
        chapter: {
          ...diskChapter,
          currentTokens: [],
          // Empty content materializes the same under every shape
          // (tokensToLexical keeps the wrapped-flat empty paragraph),
          // so the user's shape is correct AND Lexical-valid here.
          lexicalState: tokensToLexical({
            tokens: [],
            direction: args.direction,
            mode: args.shape,
          }),
          dirty: true,
        },
      });
    }

    if (differingChapters.length === 0) {
      // Entire backup is stale residue — clear it, fire-and-forget.
      void dirtyBufferStore.clear(workspaceKey, bookCode);
      continue;
    }

    const layeredForBook =
      layeredChaptersByBook.get(bookCode) ??
      new Map<number, ScriptureChapterState>();
    for (const { chapterNum, chapter } of differingChapters) {
      layeredForBook.set(chapterNum, chapter);
      if (baselineMismatch) {
        recoveredConflictTracker.add(bookCode, chapterNum);
      }
    }
    layeredChaptersByBook.set(bookCode, layeredForBook);
    restoredBookCodes.add(bookCode);
    if (baselineMismatch) {
      conflictedBookCodes.add(bookCode);
    }
  }

  if (layeredChaptersByBook.size === 0) {
    return {
      parsedFiles: args.parsedFiles,
      restoredBookCodes: [],
      conflictedBookCodes: [],
      recoveryReportEntries,
      initialLintErrorsByBook: args.initialLintErrorsByBook,
    };
  }

  // Apply the layered chapters, producing fresh book identities for touched
  // books and merging any new-to-disk chapters in chapter order.
  const layeredFiles = args.parsedFiles.map((book) => {
    const layered = layeredChaptersByBook.get(book.bookCode);
    if (!layered) return book;
    return { ...book, chapters: mergeBookChapters(book.chapters, layered) };
  });

  // Re-lint the restored books so diagnostics reflect the layered content.
  const restoredFiles = layeredFiles.filter((book) =>
    restoredBookCodes.has(book.bookCode),
  );
  const relinted = await relintBookFiles(restoredFiles, args.usfmOnionService);
  const initialLintErrorsByBook: InitialLintByBook = {
    ...args.initialLintErrorsByBook,
    ...relinted,
  };

  return {
    parsedFiles: layeredFiles,
    restoredBookCodes: [...restoredBookCodes],
    conflictedBookCodes: [...conflictedBookCodes],
    recoveryReportEntries,
    initialLintErrorsByBook,
  };
}
