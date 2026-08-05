// materializeLoadedProject.ts
//
// The main thread's half of a resident load. The host returns bytes; this turns
// them into the editor's book state and the project's first-paint findings.
//
// The verification step is not a second opinion on the host's work — it is how
// tokens become available on main at all. `materializePublished` only accepts
// the opaque handle `verifyPublishedPacked` mints, and minting it requires the
// exact source bytes the container is bound to. That is why the load carries
// every book's source: not to re-check the host, but because certification is
// the decoder's entry condition. Verification also hands back Rust-materialized
// findings for the same snapshot, so the load IS the initial lint.

import type { LintIssue, Token } from "usfm-onion-web";
import * as onion from "usfm-onion-web";
import {
  materializePublished,
  verifyPublishedPacked,
} from "usfm-onion-web/packed";

import { materializePublishedTokensToParsedFiles } from "@/app/domain/api/scriptureProjectToParsedFiles.ts";
import { groupFlatTokensByChapter } from "@/app/domain/editor/serialization/flatTokensByChapter.ts";
import type {
  HostRecovery,
  LoadedProjectBook,
  LoadProjectResult,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import {
  logStartupPhase,
  startupElapsed,
} from "@/app/domain/mirror/startupLog.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { GalleyAnalysis } from "@/core/domain/sous/galleyTypes.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

export type MaterializedLoadedProject = {
  parsedFiles: ScriptureBookState[];
  /** md5 of each book's exact disk bytes, hashed by the host that read them. */
  diskMd5ByBook: Map<string, string>;
  braidFindings: ReadonlyMap<string, readonly LintIssue[]>;
  galley: GalleyAnalysis | null;
  /** What the host's crash-recovery pass found while establishing the corpus. */
  recovery: HostRecovery;
};

export function materializeLoadedProject(args: {
  loadedProject: Project;
  load: LoadProjectResult;
}): MaterializedLoadedProject {
  const { load } = args;
  if (!load.packed || !load.sources || !load.books) {
    throw new Error(
      load.error ?? "Resident project load returned no publication",
    );
  }
  const startedAt = startupElapsed();
  // Two buffers and a table of extents into them — the host's `books` catalog
  // already IS that table, so nothing is sliced, copied, or reshaped here.
  const verified = verifyPublishedPacked(
    onion,
    new Uint8Array(load.packed),
    new Uint8Array(load.sources),
    load.books.map((book) => ({
      book: book.bookCode,
      sourceKey: book.sourceKey,
      byteOffset: book.byteOffset,
      byteLength: book.byteLength,
    })),
  );
  if (!verified.ok) {
    throw new Error(
      `Braid publication verification failed: ${JSON.stringify(verified.error)}`,
    );
  }
  const materialized = materializePublished(verified.verified);
  const parsedFiles = materializePublishedTokensToParsedFiles({
    loadedProject: args.loadedProject,
    tokensByBook: new Map(
      [...materialized].map(([book, value]) => [book, value.tokens]),
    ),
  });
  assertCorpusOrder(load.books, parsedFiles);
  applyDiskBaselineToRecoveredBooks(
    load.books,
    load.recovery ?? NO_RECOVERY,
    parsedFiles,
  );
  logStartupPhase(
    "main:materialize",
    {
      state: load.state,
      books: parsedFiles.length,
      findings: verified.findings.size,
      bytes: load.packed.byteLength,
    },
    { startedAt, durationMs: startupElapsed() - startedAt },
  );
  return {
    parsedFiles,
    diskMd5ByBook: new Map(
      load.books.map((book) => [book.bookCode, book.sourceMd5]),
    ),
    braidFindings: verified.findings,
    galley: load.galley ?? null,
    recovery: load.recovery ?? NO_RECOVERY,
  };
}

const NO_RECOVERY: HostRecovery = {
  restoredBookCodes: [],
  conflictedBookCodes: [],
  entries: [],
  diskSourceByBook: {},
};

/**
 * Give a crash-recovered book its DISK content as `sourceTokens`, and mark the
 * chapters the host says differ as dirty.
 *
 * The corpus main just materialized is the EFFECTIVE one — disk with the backup
 * layered over it — so without this a recovered book's `sourceTokens` and
 * `currentTokens` are the same tokens. That is not merely a missing banner:
 * `sourceTokens` IS main's saved-state baseline, and main re-derives `dirty`
 * from the pair on every chapter commit (`WorkingFilesStore`) and every
 * find/replace (`replaceOnStore`). Leave them equal and editing a recovered
 * chapter then undoing marks it clean while it still differs from disk — the
 * save skips the book and the dirty-buffer pipeline clears the backup, losing
 * exactly the work that was just recovered. `revertChapterToLoadedState` reads
 * the same field, so Revert All would restore the backup rather than disk.
 *
 * The disk source arrives on `recovery.diskSourceByBook`, NOT in the `sources`
 * buffer: that buffer is what the container is bound to, and layering a backup
 * rebinds the book to the backup. Parsing costs one book's parse on the rare
 * recovery path, and buys back every baseline reader unchanged.
 *
 * `dirty` still comes from the host rather than a comparison here, because
 * Braid is the authority on what "same USFM" means; chapter 0 addresses front
 * matter, matching the findings buckets.
 */
function applyDiskBaselineToRecoveredBooks(
  resident: readonly LoadedProjectBook[],
  recovery: HostRecovery,
  parsed: readonly ScriptureBookState[],
): void {
  const recovered = resident.filter((book) => book.dirtyChapters?.length);
  if (recovered.length === 0) return;
  const byCode = new Map(parsed.map((book) => [book.bookCode, book]));

  for (const entry of recovered) {
    const book = byCode.get(entry.bookCode);
    if (!book) continue;
    const dirty = new Set(entry.dirtyChapters);
    const diskUsfm = recovery.diskSourceByBook[entry.bookCode];
    if (diskUsfm === undefined) {
      throw new Error(
        `Recovered book ${entry.bookCode} arrived without its disk baseline`,
      );
    }
    const parsedDisk = onion.parse(diskUsfm);
    let diskByChapter: Record<number, Token[]>;
    try {
      diskByChapter = groupFlatTokensByChapter(
        onion.normalizeTokenSids(parsedDisk.tokens(), entry.bookCode),
      );
    } finally {
      parsedDisk.free();
    }
    for (const chapter of book.chapters) {
      chapter.dirty = dirty.has(chapter.chapterNumber);
      const diskTokens = diskByChapter[chapter.chapterNumber];
      // A chapter the backup ADDED has no disk counterpart. An empty baseline
      // is the honest answer — it is new, so all of it is unsaved.
      chapter.sourceTokens = diskTokens ?? [];
    }
  }
}

/**
 * The resident corpus is an ordered array, and main derives verse addressing
 * from its own book order — so the two orders must be the same order. A
 * mismatch does not fail anything visibly: it addresses the same sids in a
 * different sequence, and findings quietly land on the wrong verses. Cheap to
 * check once per load, and the only place both orders exist side by side.
 */
function assertCorpusOrder(
  resident: readonly LoadedProjectBook[],
  parsed: readonly ScriptureBookState[],
): void {
  const residentOrder = resident.map((book) => book.bookCode).join(",");
  const mainOrder = parsed.map((book) => book.bookCode).join(",");
  if (residentOrder !== mainOrder) {
    throw new Error(
      `Resident corpus order does not match the editor's book order.\n` +
        `  resident: ${residentOrder}\n` +
        `  main:     ${mainOrder}`,
    );
  }
}
