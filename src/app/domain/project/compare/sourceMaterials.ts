import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

import {
  COMPARE_SOURCE_KIND,
  type CompareMetadataSummary,
  type CompareSourceDescriptor,
  type CompareSourceLocator,
  type CompareSourceMaterial,
} from "./types.ts";

type MaterialTokenView = "working" | "saved";

function projectIdOf(project: Project): string {
  return project.projectId ?? project.folderName;
}

export function compareMetadataForProject(
  project: Project,
): CompareMetadataSummary {
  return {
    projectId: projectIdOf(project),
    languageId: project.language.code,
    languageDirection: project.language.direction,
  };
}

/**
 * Capture a source at reload time so a compare session never observes later
 * array mutation through the resident workspace objects.
 */
function snapshotFiles(
  files: readonly ScriptureBookState[],
  tokenView: MaterialTokenView,
): ScriptureBookState[] {
  const snapshot = files.map((book) => {
    const chapters = book.chapters.map((chapter) => {
      const sourceTokens = [...chapter.sourceTokens];
      Object.freeze(sourceTokens);
      const currentTokens =
        tokenView === "saved" ? sourceTokens : [...chapter.currentTokens];
      Object.freeze(currentTokens);

      return Object.freeze({
        ...chapter,
        sourceTokens,
        currentTokens,
        dirty: tokenView === "working" && chapter.dirty,
      });
    });
    Object.freeze(chapters);
    return Object.freeze({ ...book, chapters });
  });
  Object.freeze(snapshot);
  return snapshot;
}

export function createCompareSourceDescriptor(args: {
  id: string;
  label: string;
  locator: CompareSourceLocator;
  writable?: boolean;
  reload: () => Promise<CompareSourceMaterial>;
}): CompareSourceDescriptor {
  return Object.freeze({
    id: args.id,
    label: args.label,
    locator: args.locator,
    writable: args.writable ?? false,
    reload: args.reload,
  });
}

export function createWorkingCompareSourceDescriptor(args: {
  workingFilesStore: WorkingFilesStore;
  project: Project;
  label?: string;
}): CompareSourceDescriptor {
  const projectId = projectIdOf(args.project);
  return createCompareSourceDescriptor({
    id: `${COMPARE_SOURCE_KIND.WORKING}:${projectId}`,
    label: args.label ?? "Working copy",
    locator: { kind: COMPARE_SOURCE_KIND.WORKING, projectId },
    writable: true,
    reload: async () => ({
      files: snapshotFiles(args.workingFilesStore.read(), "working"),
      metadata: compareMetadataForProject(args.project),
    }),
  });
}

export function createSavedCompareSourceDescriptor(args: {
  workingFilesStore: WorkingFilesStore;
  project: Project;
  label?: string;
}): CompareSourceDescriptor {
  const projectId = projectIdOf(args.project);
  return createCompareSourceDescriptor({
    id: `${COMPARE_SOURCE_KIND.SAVED}:${projectId}`,
    label: args.label ?? "Saved copy",
    locator: { kind: COMPARE_SOURCE_KIND.SAVED, projectId },
    reload: async () => ({
      files: snapshotFiles(args.workingFilesStore.read(), "saved"),
      metadata: compareMetadataForProject(args.project),
    }),
  });
}
