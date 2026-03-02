import type { ProjectDiff } from "@/app/domain/project/diffTypes.ts";
import type { DiffsByChapterMap } from "@/core/domain/usfm/chapterDiffOperation.ts";

export type CompareMode = "unsaved" | "external";
export type CompareBaseline = "currentSaved" | "currentDirty";
export type CompareSourceKind =
    | "existingProject"
    | "zipFile"
    | "directory"
    | "previousVersion";

export type CompareWarningCode =
    | "language_id_mismatch"
    | "direction_mismatch"
    | "project_id_mismatch"
    | "book_coverage_diff";

export type CompareSessionConfig = {
    mode: CompareMode;
    baseline: CompareBaseline;
    source:
        | {
              kind: "existingProject";
              projectId: string;
          }
        | {
              kind: "zipFile";
              fileName?: string;
          }
        | {
              kind: "directory";
              directoryName?: string;
          }
        | {
              kind: "previousVersion";
              commitHash: string;
          };
};

export type CompareWarning = {
    code: CompareWarningCode;
    message: string;
};

export type CompareCoverageSummary = {
    baselineOnly: Array<{ bookCode: string; chapterNum: number }>;
    sourceOnly: Array<{ bookCode: string; chapterNum: number }>;
    overlapping: Array<{ bookCode: string; chapterNum: number }>;
};

export type CompareDiff = ProjectDiff;

export type CompareResult = {
    diffsByChapter: DiffsByChapterMap<CompareDiff>;
    diffs: CompareDiff[];
    warnings: CompareWarning[];
    coverage: CompareCoverageSummary;
};
