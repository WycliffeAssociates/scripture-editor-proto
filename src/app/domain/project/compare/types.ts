import type { LineEnding } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import type { DiffSkeleton, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { GitRemoteRelationshipKind } from "@/core/persistence/gitRemoteRelationship.ts";

export type CompareSide = "left" | "right";
export type CompareDecision = CompareSide;
export type CompareDecisionMap = Readonly<Record<string, CompareDecision>>;
export type CompareChapterDecisions = Readonly<{
  units: CompareDecisionMap;
  /** Needed only when presence differs and Onion emits no actionable unit. */
  presence: CompareSide | null;
}>;

export const COMPARE_SOURCE_KIND = {
  WORKING: "working",
  SAVED: "saved",
  EXISTING_PROJECT: "existingProject",
  ZIP_FILE: "zipFile",
  DIRECTORY: "directory",
  PREVIOUS_VERSION: "previousVersion",
  REMOTE_LATEST: "remoteLatest",
} as const;

export type CompareSourceKind =
  (typeof COMPARE_SOURCE_KIND)[keyof typeof COMPARE_SOURCE_KIND];

/** A stable, reloadable identity for either side of a comparison. */
export type CompareSourceLocator =
  | { kind: "working"; projectId: string }
  | { kind: "saved"; projectId: string }
  | { kind: "existingProject"; projectId: string }
  | { kind: "zipFile"; loadId: string; fileName: string }
  | { kind: "directory"; loadId: string; displayPath: string }
  | { kind: "previousVersion"; projectId: string; oid: string }
  | { kind: "remoteLatest"; projectId: string };

export type CompareSourceDescriptor = Readonly<{
  id: string;
  label: string;
  locator: CompareSourceLocator;
  /** Only the resident working copy may be writable. */
  writable: boolean;
  /** Re-resolves this address when Refresh creates a new frozen snapshot. */
  reload: () => Promise<CompareSourceMaterial>;
}>;

export type CompareSourceMaterial = Readonly<{
  files: ScriptureBookState[];
  metadata?: CompareMetadataSummary;
  cleanup?: () => Promise<void>;
  /** Resolved transport state for this one frozen remote materialization. */
  remoteSync?: CompareRemoteSync;
}>;

export type CompareRemoteSync = Readonly<{
  remoteHead: string;
  localHead: string | null;
  mergeBase: string | null;
  trackedBranch: string;
  relationship: GitRemoteRelationshipKind;
}>;

export type CompareSourcePair = Readonly<{
  left: CompareSourceDescriptor;
  right: CompareSourceDescriptor;
  writableSide: CompareSide | null;
}>;

export type CompareWarningCode =
  | "language_id_mismatch"
  | "direction_mismatch"
  | "project_id_mismatch"
  | "book_coverage_diff";

export type CompareWarning = Readonly<{
  code: CompareWarningCode;
  message: string;
}>;

export type ChapterAddress = Readonly<{
  bookCode: string;
  chapterNum: number;
}>;

export type CompareCoverageSummary = Readonly<{
  leftOnly: readonly ChapterAddress[];
  rightOnly: readonly ChapterAddress[];
  overlapping: readonly ChapterAddress[];
}>;

export type FrozenChapterComparison = Readonly<{
  address: ChapterAddress;
  /** Canonical-SID arrays frozen before diff and reused unchanged for merge. */
  left: FrozenChapterSide;
  right: FrozenChapterSide;
  skeleton: DiffSkeleton;
}>;

export type FrozenChapterSide = Readonly<{
  present: boolean;
  dirty: boolean;
  eol: LineEnding | null;
  direction: LanguageDirection | null;
  book: FrozenBookMetadata | null;
  tokens: readonly Token[];
}>;

/** Metadata required to materialize a book that is absent from Working. */
export type FrozenBookMetadata = Readonly<{
  path: string;
  title: string;
  bookCode: string;
  nextBookId: string | null;
  prevBookId: string | null;
  sort?: number;
}>;

export type CompareChaptersByBook = Readonly<
  Record<string, Readonly<Record<number, FrozenChapterComparison>>>
>;

export type CompareDecisionsByBook = Readonly<
  Record<string, Readonly<Record<number, CompareChapterDecisions>>>
>;

export type CompareMetadataSummary = Readonly<{
  projectId?: string;
  languageId?: string;
  languageDirection?: LanguageDirection;
}>;

export type CompareResult = Readonly<{
  sources: CompareSourcePair;
  chapters: CompareChaptersByBook;
  warnings: readonly CompareWarning[];
  coverage: CompareCoverageSummary;
  changedUnitCount: number;
}>;

export type CompareSessionLifecycle =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "stale"; reason: "working-copy-changed" }
  | { status: "applying"; projectionRevision: number }
  | { status: "applied"; projectionRevision: number }
  | { status: "error"; message: string };

export type CompareSession = Readonly<{
  id: string;
  snapshot: CompareResult;
  decisions: CompareDecisionsByBook;
  decisionRevision: number;
  lifecycle: CompareSessionLifecycle;
}>;
