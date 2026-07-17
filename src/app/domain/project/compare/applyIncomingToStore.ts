import { applyCompareProjectionToWorkingFiles } from "@/app/domain/project/compare/compareMutations.ts";
import type { CompareProjectionArtifact } from "@/app/domain/project/compare/projection.ts";
import {
  type IncomingMutationResult,
  type IncomingMutationRunResult,
  incomingMutationAborted,
} from "@/app/domain/project/remoteSync/commandResults.ts";
import {
  commitIfNotStale,
  type StalenessScope,
} from "@/app/domain/project/validatedStoreMutation.ts";
import type { ChapterRef } from "@/app/domain/project/workingFileMutations.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";

export async function runIncomingMutation<T>(args: {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  scope: StalenessScope;
  compute: () => Promise<T>;
  commit: (computed: T, latest: ScriptureBookState[]) => void;
}): Promise<IncomingMutationRunResult<T>> {
  const startState = args.workingFilesStore.read();
  const computed = await args.compute();
  const outcome = commitIfNotStale({
    workingFilesStore: args.workingFilesStore,
    interactionGate: args.interactionGate,
    startState,
    scope: args.scope,
    commit: (latest) => args.commit(computed, latest),
  });
  return outcome.kind === "committed"
    ? { kind: "committed", computed }
    : { kind: "aborted", reason: outcome.reason, computed };
}

function overlayProjectedChapters(args: {
  latest: ScriptureBookState[];
  scratch: ScriptureBookState[];
  affected: readonly ChapterRef[];
}) {
  const affectedByBook = new Map<string, Set<number>>();
  for (const ref of args.affected) {
    const chapters = affectedByBook.get(ref.bookCode) ?? new Set<number>();
    chapters.add(ref.chapterNum);
    affectedByBook.set(ref.bookCode, chapters);
  }
  const scratchByBook = new Map(
    args.scratch.map((book) => [book.bookCode, book] as const),
  );
  const result: ScriptureBookState[] = [];

  for (const latestBook of args.latest) {
    const affected = affectedByBook.get(latestBook.bookCode);
    if (!affected) {
      result.push(latestBook);
      continue;
    }
    const scratchBook = scratchByBook.get(latestBook.bookCode);
    const scratchChapters = new Map(
      scratchBook?.chapters.map((chapter) => [
        chapter.chapterNumber,
        chapter,
      ]) ?? [],
    );
    const chapters = latestBook.chapters
      .filter(
        (chapter) =>
          !affected.has(chapter.chapterNumber) ||
          scratchChapters.has(chapter.chapterNumber),
      )
      .map((chapter) =>
        affected.has(chapter.chapterNumber)
          ? (scratchChapters.get(chapter.chapterNumber) ?? chapter)
          : chapter,
      );
    for (const chapterNum of affected) {
      if (latestBook.chapters.some((c) => c.chapterNumber === chapterNum)) {
        continue;
      }
      const created = scratchChapters.get(chapterNum);
      if (created) chapters.push(created);
    }
    if (chapters.length > 0) {
      result.push({
        ...(scratchBook ?? latestBook),
        chapters: chapters.sort(
          (left, right) => left.chapterNumber - right.chapterNumber,
        ),
      });
    }
  }

  const latestCodes = new Set(args.latest.map((book) => book.bookCode));
  for (const [bookCode] of affectedByBook) {
    if (latestCodes.has(bookCode)) continue;
    const created = scratchByBook.get(bookCode);
    if (created?.chapters.length) result.push(created);
  }
  return result;
}

/**
 * Commit an already-computed merge projection through the shared stale/gate
 * boundary. This method never invokes Onion: Preview and Apply consume the
 * identical artifact revision.
 */
export async function applyIncomingToStore(args: {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  artifact: CompareProjectionArtifact;
}): Promise<IncomingMutationResult<CompareProjectionArtifact>> {
  if (!args.artifact.complete) {
    return incomingMutationAborted({
      reason: "empty-plan",
      computed: args.artifact,
    });
  }
  const affected = args.artifact.chapters
    .filter((chapter) => chapter.structuralAction !== "unchanged")
    .map((chapter) => chapter.address);
  if (affected.length === 0) {
    return incomingMutationAborted({
      reason: "empty-plan",
      computed: args.artifact,
    });
  }

  return await runIncomingMutation({
    workingFilesStore: args.workingFilesStore,
    interactionGate: args.interactionGate,
    scope: { kind: "chapters", candidates: affected },
    compute: async () => args.artifact,
    commit: (artifact, latest) => {
      const scratch = args.workingFilesStore.draftWithChapters(affected);
      applyCompareProjectionToWorkingFiles({ workingFiles: scratch, artifact });
      args.workingFilesStore.commit({
        patch: {
          kind: "bulk",
          files: overlayProjectedChapters({ latest, scratch, affected }),
        },
        meta: {
          kind: "import",
          action: "applyIncoming",
          scope: { project: true },
          dirtyTextContent: true,
        },
      });
    },
  });
}
