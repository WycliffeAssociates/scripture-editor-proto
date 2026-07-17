import type { LineEnding } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

import {
  chapterDecisionCompleteness,
  decisionsForChapter,
  iterateChapters,
  requiresExplicitPresenceDecision,
  toMergeRequest,
} from "./decisionState.ts";
import type {
  ChapterAddress,
  CompareChapterDecisions,
  CompareDecisionsByBook,
  CompareResult,
  FrozenBookMetadata,
  FrozenChapterComparison,
} from "./types.ts";

export type ProjectedChapter = Readonly<{
  address: ChapterAddress;
  tokens: readonly Token[];
  present: boolean;
  eol: LineEnding | null;
  direction: LanguageDirection | null;
  book: FrozenBookMetadata | null;
  structuralAction: "add" | "update" | "delete" | "unchanged";
}>;

export type CompareProjectionArtifact = Readonly<{
  revision: number;
  chapters: readonly ProjectedChapter[];
  unresolved: readonly ChapterAddress[];
  complete: boolean;
}>;

export type CompareProjectionState =
  | Readonly<{ status: "idle"; revision: number }>
  | Readonly<{ status: "running"; revision: number }>
  | Readonly<{
      status: "ready";
      revision: number;
      artifact: CompareProjectionArtifact;
    }>
  | Readonly<{ status: "error"; revision: number; message: string }>;

/**
 * Projects every fully-decided chapter. An incomplete session can still preview
 * a decided chapter, but only a complete artifact is eligible for Apply.
 */
export async function projectCompareRevision(args: {
  snapshot: CompareResult;
  decisions: CompareDecisionsByBook;
  revision: number;
  usfmOnionService: IUsfmOnionService;
}): Promise<CompareProjectionArtifact> {
  if (args.snapshot.sources.writableSide === null) {
    throw new Error(
      "Read-only comparisons do not produce a merged projection.",
    );
  }

  const chapters: ProjectedChapter[] = [];
  const unresolved: ChapterAddress[] = [];
  for (const chapter of iterateChapters(args.snapshot)) {
    const decisions = decisionsForChapter(args.decisions, chapter);
    if (!chapterDecisionCompleteness(chapter, decisions).complete) {
      unresolved.push(chapter.address);
      continue;
    }
    const tokens = await args.usfmOnionService.mergeDiffBlocks(
      chapter.left.tokens,
      chapter.right.tokens,
      toMergeRequest({
        skeleton: chapter.skeleton,
        decisions: decisions.units,
        defaultSide: args.snapshot.sources.writableSide,
      }),
    );
    const working =
      args.snapshot.sources.writableSide === "left"
        ? chapter.left
        : chapter.right;
    const other =
      args.snapshot.sources.writableSide === "left"
        ? chapter.right
        : chapter.left;
    const present = projectedPresence(chapter, decisions);
    const structuralAction =
      !working.present && present
        ? "add"
        : working.present && !present
          ? "delete"
          : working.present && present && !tokensEqual(working.tokens, tokens)
            ? "update"
            : working.present && present && working.dirty
              ? "update"
              : "unchanged";
    chapters.push(
      Object.freeze({
        address: chapter.address,
        tokens: Object.freeze(tokens),
        present,
        eol: present ? (working.eol ?? other.eol ?? "\n") : null,
        direction: present ? (working.direction ?? other.direction) : null,
        book: working.book ?? other.book,
        structuralAction,
      }),
    );
  }

  return Object.freeze({
    revision: args.revision,
    chapters: Object.freeze(chapters),
    unresolved: Object.freeze(unresolved),
    complete: unresolved.length === 0,
  });
}

function projectedPresence(
  chapter: FrozenChapterComparison,
  decisions: CompareChapterDecisions,
): boolean {
  if (chapter.left.present === chapter.right.present) {
    return chapter.left.present;
  }
  if (requiresExplicitPresenceDecision(chapter)) {
    if (decisions.presence === null) {
      throw new Error("Chapter presence decision is unresolved.");
    }
    return decisions.presence === "left"
      ? chapter.left.present
      : chapter.right.present;
  }
  return chapter.skeleton.units
    .filter((unit) => unit.status !== "unchanged")
    .some((unit) => {
      const selected = decisions.units[unit.id];
      return selected === "left"
        ? chapter.left.present
        : selected === "right"
          ? chapter.right.present
          : false;
    });
}

function tokensEqual(left: readonly Token[], right: readonly Token[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function reduceProjectionState(
  state: CompareProjectionState,
  event:
    | { type: "started"; revision: number }
    | { type: "completed"; artifact: CompareProjectionArtifact }
    | { type: "failed"; revision: number; message: string },
): CompareProjectionState {
  if (event.type === "started") {
    return event.revision < state.revision
      ? state
      : Object.freeze({ status: "running", revision: event.revision });
  }
  const revision =
    event.type === "completed" ? event.artifact.revision : event.revision;
  if (revision !== state.revision) return state;
  return event.type === "completed"
    ? Object.freeze({ status: "ready", revision, artifact: event.artifact })
    : Object.freeze({ status: "error", revision, message: event.message });
}

export function assertApplyArtifact(args: {
  artifact: CompareProjectionArtifact;
  currentRevision: number;
}): CompareProjectionArtifact {
  if (args.artifact.revision !== args.currentRevision) {
    throw new Error("Projection is stale for the current decision map.");
  }
  if (!args.artifact.complete) {
    throw new Error("Projection still contains unresolved chapters.");
  }
  return args.artifact;
}
