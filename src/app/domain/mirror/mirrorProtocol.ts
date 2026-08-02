// mirrorProtocol.ts
//
// Transport-agnostic message vocabulary for a workspace mirror session.
//
// A mirror is a passive replica of the editor's per-chapter token state that
// lives wherever the analysis engines live — a web worker on web, a
// Rust-managed resident `State` (reached over IPC) on desktop. The main thread
// is the SOLE writer: it tokenizes the
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

import type { SousConfig } from "scripture-sous-chef-web";
import type {
  FormatOptions,
  CorpusScope,
  LintSnapshot,
  PublishedBookInfo,
} from "usfm-onion-web";

import type { DiskBaseline } from "@/app/state/DirtyBufferStore.ts";
import type { GalleyCacheIdentity } from "@/core/domain/sous/galleyTypes.ts";
import type { LineEnding } from "@/core/domain/usfm/usfmBytes.ts";
import type { Token, TokenFix } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { SegmentsBySid } from "@/core/domain/usfm/vrefTypes.ts";

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

/** Replace one structurally changed book in its complete editor order. */
export type UpdateBookPatch = {
  kind: "updateBook";
  book: FullSyncBook;
  generation: Generation;
};

/** Remove a book whose last resident chapter disappeared. */
export type RemoveBookPatch = {
  kind: "removeBook";
  bookCode: string;
  generation: Generation;
};

/** Record what disk holds for a book — needed for the backup envelope. */
export type PushBaselinePatch = {
  kind: "pushBaseline";
  bookCode: string;
  diskBaseline: DiskBaseline;
  /** Exact last-saved token stream used to seed Braid's baseline. */
  baselineTokens: Token[];
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
  /** Exact last-saved token stream used to seed Braid's baseline. */
  baselineTokens: Token[];
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
  /** Exact last-saved token stream used to advance Braid's baseline. */
  baselineTokens: Token[];
  chapterDirty: Array<{ chapterNum: number; dirty: boolean }>;
};

export type MirrorPatch =
  | PushChapterPatch
  | DeleteChapterPatch
  | UpdateBookPatch
  | RemoveBookPatch
  | PushBaselinePatch
  | FullSyncPatch
  | SyncMetaPatch;

// --- Commands (main → mirror): read resident state, produce a result. ------

/** Ownership policy for the single whole-corpus Galley cache file. */
export type GalleyCachePolicy = "restore" | "none" | "refresh";

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
  generation: Generation;
  requestId?: RequestId;
};

export type AnalyzeGalleyCommand = {
  kind: "analyzeGalley";
  generation: Generation;
  requestId?: RequestId;
  config?: SousConfig;
  cachePolicy: GalleyCachePolicy;
};

export type FormatBraidCommand = {
  kind: "formatBraid";
  generation: Generation;
  requestId: RequestId;
  scope: CorpusScope;
  options?: FormatOptions;
};

/** Apply one snapshot-bound lint fix through the resident Braid. */
export type ApplyBraidFixCommand = {
  kind: "applyBraidFix";
  generation: Generation;
  requestId: RequestId;
  bookCode: string;
  fix: TokenFix;
};

/** Ask the resident Braid to emit the current corpus in document order. */
export type PublishBraidCommand = {
  kind: "publishBraid";
  generation: Generation;
  requestId: RequestId;
};

export type RestoreBraidRecord = {
  bookCode: string;
  sourceKey: string;
  source: string;
};

export type RestoreBraidCommand = {
  kind: "restoreBraid";
  generation: Generation;
  packed: ArrayBuffer;
  records: RestoreBraidRecord[];
};

/** Ask the resident host to serialize the dirty book and persist its envelope. */
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
  | AnalyzeGalleyCommand
  | FormatBraidCommand
  | ApplyBraidFixCommand
  | PublishBraidCommand
  | RestoreBraidCommand
  | WriteBackupCommand
  | ClearBackupCommand;

// --- Results (mirror → main): stamped with the generation they ran at. -----

/**
 * Lint results are the complete resident corpus snapshot, materialized by the
 * host. Galley returns one complete packed workspace snapshot; the main thread
 * owns cache validation, decoding, normalization, and findings-store
 * publication.
 */
export type LintResult = {
  kind: "lintResult";
  /** One complete resident Braid snapshot; never a per-book delta. */
  snapshot: LintSnapshot;
  ranAtGeneration: Generation;
  /** Echoed from the command that requested this pass, when it carried one. */
  requestId?: RequestId;
};

export type GalleyResult = {
  kind: "galleyResult";
  packed: ArrayBuffer;
  keys: string[];
  segments: SegmentsBySid;
  cacheState: "fresh" | "persisted";
  expectedIdentity?: GalleyCacheIdentity;
  ranAtGeneration: Generation;
  /** Echoed from the command that requested this pass, when it carried one. */
  requestId?: RequestId;
};

export type FormatBraidResult = {
  kind: "formatBraidResult";
  requestId: RequestId;
  books: Record<string, Token[]>;
  usfm: Record<string, string>;
  ranAtGeneration: Generation;
  behind: boolean;
  superseded: boolean;
};

export type ApplyBraidFixResult = {
  kind: "applyBraidFixResult";
  requestId: RequestId;
  books: Record<string, Token[]>;
  usfm: Record<string, string>;
  ranAtGeneration: Generation;
  behind: boolean;
  superseded: boolean;
};

export type BraidPublication = {
  packed: ArrayBuffer;
  snapshotId: string;
  books: PublishedBookInfo[];
  /** Complete ordered source table; reused books are included. */
  sources: RestoreBraidRecord[];
  serializedBooks: Array<{ bookCode: string; contents: string }>;
};

export type PublishBraidResult = {
  kind: "publishBraidResult";
  requestId: RequestId;
  publication?: BraidPublication;
  ranAtGeneration: Generation;
  behind: boolean;
  superseded: boolean;
};

export type RestoreBraidResult = {
  kind: "restoreBraidResult";
  accepted: boolean;
  ranAtGeneration: Generation;
  error?: string;
};

/** A correlated resident-Braid operation failed before it could produce a result. */
export type BraidCommandErrorResult = {
  kind: "braidCommandError";
  requestId: RequestId;
  operation: "formatBraid" | "applyBraidFix" | "publishBraid";
  error: string;
};

/**
 * Backup acknowledgement. Web and desktop persist through their resident host.
 */
export type BackupResult = {
  kind: "backupResult";
  bookCode: string;
  /** True when the mirror cleared the backup (book went clean). */
  cleared?: boolean;
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
  | GalleyResult
  | FormatBraidResult
  | ApplyBraidFixResult
  | PublishBraidResult
  | RestoreBraidResult
  | BraidCommandErrorResult
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
  sendCommand(command: MirrorCommand, transfer?: Transferable[]): void;
}

/** What the main side registers to consume results coming back from a mirror. */
export type MirrorResultHandler = (result: MirrorResult) => void;
