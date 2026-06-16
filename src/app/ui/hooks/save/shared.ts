import type { CompareMetadataSummary } from "@/app/domain/project/compare/compareService.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Shared helpers used by save/revert/version/compare hooks.
 *
 * These utilities sit above the core project services and below the UI-facing
 * hooks. Their job is to keep the scripture workspace state, diff state, and
 * live editor selection in sync after save-like mutations.
 */
export type ChapterRef = { bookCode: string; chapterNum: number };

export function selectScriptureBookStatesForChapterRefs(
  files: ScriptureBookState[],
  chapters: ChapterRef[],
): ScriptureBookState[] {
  const wantedByBook = new Map<string, Set<number>>();
  for (const chapter of chapters) {
    const wanted = wantedByBook.get(chapter.bookCode) ?? new Set<number>();
    wanted.add(chapter.chapterNum);
    wantedByBook.set(chapter.bookCode, wanted);
  }

  return files
    .map((file) => {
      const wanted = wantedByBook.get(file.bookCode);
      if (!wanted) return null;

      const matchingChapters = file.chapters.filter((chapter) =>
        wanted.has(chapter.chapterNumber),
      );
      if (matchingChapters.length === 0) return null;

      return {
        ...file,
        chapters: matchingChapters,
      };
    })
    .filter((file): file is ScriptureBookState => Boolean(file));
}

/**
 * Metadata the compare UI uses to label the current loaded scripture workspace.
 */
export function buildCurrentProjectCompareMetadata(
  loadedProject: Project,
): CompareMetadataSummary {
  return {
    projectId: loadedProject.projectId ?? loadedProject.folderName,
    languageId: loadedProject.language.code,
    languageDirection: loadedProject.language.direction,
  };
}
