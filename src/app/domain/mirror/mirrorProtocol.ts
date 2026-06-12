// mirrorProtocol.ts
//
// Transport-agnostic message vocabulary for a workspace mirror session.
//
// A mirror is a passive replica of the editor's per-chapter token state that
// lives wherever the analysis engines live (today: one web worker; later: a
// Rust managed state). The main thread is the SOLE writer: it tokenizes the
// chapters a commit changed exactly once and PUSHES the delta; the mirror
// applies it and, on command, reads its OWN resident state to run an engine or
// serialize a crash-recovery backup. The mirror never walks Lexical state and
// never receives a re-serialized book — only token deltas cross the boundary.
//
// "Patches before commands on the same FIFO channel" is the only ordering web
// needs (one postMessage channel). Every message and result still carries the
// `generation` it describes so a transport without causal ordering (Tauri's
// concurrent invokes, a future multicast fan-out) can apply patches
// idempotently and drop stale results. Stamping is uniform so no transport has
// to special-case it.

import type { DiskBaseline } from "@/app/state/DirtyBufferStore.ts";
import type { SousAnalyzeResult } from "@/core/domain/sous/sousTypes.ts";
import type { LineEnding } from "@/core/domain/usfm/usfmBytes.ts";
import type { LintIssue, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/** A chapter address in the mirror, mirroring the editor's `(book, chapter)`. */
export type ChapterRef = { bookCode: string; chapterNum: number };

/** The store generation a message/result describes — monotonic per store. */
export type Generation = number;

/**
 * One chapter's resident state in the mirror. `tokens` is the tokenized
 * working content (what `currentTokens` holds on main); `eol` and `dirty` ride
 * as metadata because the backup serializer needs the chapter's line ending
 * and the dirty/clean decision is made against the mirror's own view.
 */
export type MirrorChapter = {
  tokens: Token[];
  eol: LineEnding;
  dirty: boolean;
};

// --- Patches (main → mirror): the only token-carrying verbs. ---------------

/** Upsert one chapter's tokens + metadata. */
export type PushChapterPatch = {
  kind: "pushChapter";
  ref: ChapterRef;
  chapter: MirrorChapter;
  generation: Generation;
};

/** Drop one chapter (book lost a chapter, or a book vanished chapter-wise). */
export type DeleteChapterPatch = {
  kind: "deleteChapter";
  ref: ChapterRef;
  generation: Generation;
};

/** Record what disk holds for a book — needed for the backup envelope. */
export type PushBaselinePatch = {
  kind: "pushBaseline";
  bookCode: string;
  diskBaseline: DiskBaseline;
  generation: Generation;
};

/**
 * Replace the WHOLE mirror with this set of books — the load-time seed and the
 * `project: true` resync. A book absent from `books` is dropped: a list of
 * survivors cannot be misread as "leave the rest", which is exactly the
 * vanished-book case explicit deletes alone can't express across one message.
 */
export type FullSyncPatch = {
  kind: "fullSync";
  books: FullSyncBook[];
  generation: Generation;
};

export type FullSyncBook = {
  bookCode: string;
  diskBaseline: DiskBaseline;
  chapters: Array<{ chapterNum: number; chapter: MirrorChapter }>;
};

/**
 * Sync per-book disk baselines + per-chapter dirty flags WITHOUT touching
 * tokens — the cheap path for a project-scope commit that moved only metadata
 * (the save clean-mark: dirty flags clear and disk baselines advance, but no
 * chapter's text changed). Unlike `fullSync` this carries no tokens and cannot
 * add or remove content: the mirror updates flags/baselines on the entries it
 * already holds. A book or chapter absent from the editor's view is simply not
 * mentioned; nothing is dropped.
 */
export type SyncMetaPatch = {
  kind: "syncMeta";
  books: SyncMetaBook[];
  generation: Generation;
};

export type SyncMetaBook = {
  bookCode: string;
  diskBaseline: DiskBaseline;
  chapterDirty: Array<{ chapterNum: number; dirty: boolean }>;
};

export type MirrorPatch =
  | PushChapterPatch
  | DeleteChapterPatch
  | PushBaselinePatch
  | FullSyncPatch
  | SyncMetaPatch;

// --- Commands (main → mirror): read resident state, produce a result. ------

/**
 * A command's reaction scope, expressed in the SAME book-granular vocabulary
 * the main-thread `commitFilters` policies emit. `"all"` means every book the
 * mirror currently holds (the `project: true` fold). Chapter→book widening for
 * lint/sous happens HERE, mirror-side, by reading resident tokens — the patch
 * only ever carried the changed chapter.
 */
export type AnalyzeScope = { books: ReadonlyArray<string> } | "all";

/**
 * Optional correlation id. When present on an analyze command it is echoed on
 * the matching result so a caller can await one specific pass — the minimal id
 * correlation the load contract uses to await its initial lint + sous before
 * releasing the loading gate. Live passes omit it and flow through the result
 * router by generation as before; this adds no general RPC layer.
 */
export type RequestId = string;

export type AnalyzeLintCommand = {
  kind: "analyzeLint";
  scope: AnalyzeScope;
  generation: Generation;
  requestId?: RequestId;
};

export type AnalyzeSousCommand = {
  kind: "analyzeSous";
  scope: AnalyzeScope;
  generation: Generation;
  requestId?: RequestId;
};

/** Serialize the book's dirty chapters to a backup envelope and persist it. */
export type WriteBackupCommand = {
  kind: "writeBackup";
  bookCode: string;
  appVersion: string;
  generation: Generation;
};

/** Drop the book's backup (it went clean). */
export type ClearBackupCommand = {
  kind: "clearBackup";
  bookCode: string;
  generation: Generation;
};

export type MirrorCommand =
  | AnalyzeLintCommand
  | AnalyzeSousCommand
  | WriteBackupCommand
  | ClearBackupCommand;

// --- Results (mirror → main): stamped with the generation they ran at. -----

/**
 * Lint/sous results are the RAW engine outputs per book, unchanged from what
 * the single-thread services returned — normalization (`normalizeFindings`)
 * and the findings-store commit stay on main, so downstream consumers see the
 * exact shapes they see today.
 */
export type LintResult = {
  kind: "lintResult";
  byBook: Record<string, LintIssue[]>;
  ranAtGeneration: Generation;
  /** Echoed from the command that requested this pass, when it carried one. */
  requestId?: RequestId;
};

export type SousResult = {
  kind: "sousResult";
  byBook: Record<string, SousAnalyzeResult>;
  ranAtGeneration: Generation;
  /** Echoed from the command that requested this pass, when it carried one. */
  requestId?: RequestId;
};

/**
 * The desktop interim backup result: a worker can't `invoke`, so it ships the
 * finished envelope bytes back and main does one dumb FS write. Web persists
 * inside the mirror and reports `{ wrote: true }` with no envelope.
 */
export type BackupResult = {
  kind: "backupResult";
  bookCode: string;
  /** Present only when the mirror could not persist itself (desktop). */
  envelopeJson?: string;
  /** True when the mirror cleared the backup (book went clean). */
  cleared?: boolean;
  /**
   * True when the book went clean but the mirror's host could not clear the
   * backup itself (the desktop backup worker can't `invoke` to reach Tauri FS):
   * main must do the clear through the `DirtyBufferStore` seam. Web clears in
   * the worker (OPFS) and leaves this unset.
   */
  clearOnMain?: boolean;
  ranAtGeneration: Generation;
};

/**
 * The mirror asks main for a fresh `fullSync` — e.g. a worker restarted and
 * lost its module-scope state. Carries the last generation it had so main can
 * decide it's behind.
 */
export type ResyncRequest = {
  kind: "resyncRequest";
  lastGeneration: Generation;
};

export type MirrorResult =
  | LintResult
  | SousResult
  | BackupResult
  | ResyncRequest;

// --- The session boundary --------------------------------------------------

/**
 * A multicast feed of patches/commands the main thread writes to. One sink per
 * mirror; today there is one (the web worker / its in-process stand-in), but
 * the producer is built for N so a future cold-loop sous mirror subscribes to
 * the same feed.
 */
export interface MirrorSink {
  pushPatch(patch: MirrorPatch): void;
  sendCommand(command: MirrorCommand): void;
}

/** What the main side registers to consume results coming back from a mirror. */
export type MirrorResultHandler = (result: MirrorResult) => void;
