// projectWorkspaceMappers.ts
//
// Pure mappers/builders that keep DefaultProjectsService focused on
// orchestration rather than data-shape plumbing. These take their inputs
// explicitly (no service state) and are unit-testable in isolation.

import { removeLeadingDirSlashes } from "@/core/data/utils/generic.ts";
import type { MetadataEditorDocument } from "@/core/domain/project/metadataEditor.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import { basenameStoragePath } from "@/core/persistence/pathUtils.ts";
import type {
  BookRef,
  Project as FacadeProject,
  ProjectListItem,
  ScriptureWorkspace,
} from "@/core/persistence/ScriptureWorkspace.ts";

export function toProjectListItem(project: FacadeProject): ProjectListItem {
  return {
    folderName: project.folderName,
    projectPath: project.projectPath,
    displayName: project.displayName,
    projectId: project.projectId,
    languageCode: project.language.code,
    languageName: project.language.name,
    projectType: project.projectType,
  };
}

export function toResourceListItem(
  resource: LoadedReferenceItem,
): ProjectListItem {
  return {
    folderName: resource.folderName,
    projectPath: resource.managedPath,
    displayName: resource.displayName,
    projectId: resource.projectId,
    languageCode: resource.descriptor.language.code,
    languageName: resource.descriptor.language.name,
    projectType: resource.projectType,
  };
}

/**
 * Build a degraded "metadata review" workspace: a ScriptureWorkspace whose book
 * reads/writes throw until the project's metadata is repaired. Pure — derives
 * entirely from the projectPath + the in-progress metadata draft.
 */
export function buildMetadataReviewWorkspace(args: {
  projectPath: string;
  document: MetadataEditorDocument;
}): ScriptureWorkspace {
  const folderName = basenameStoragePath(args.projectPath);
  const books: BookRef[] = [];
  if (args.document.draft.kind === "resource-container") {
    for (const project of args.document.draft.projects) {
      if (
        project.identifier.trim().length > 0 &&
        project.path.trim().length > 0
      ) {
        books.push({
          bookCode: project.identifier.toUpperCase(),
          title: project.title,
          fileName:
            removeLeadingDirSlashes(project.path).split("/").at(-1) ??
            project.path,
          storageKey:
            removeLeadingDirSlashes(project.path).split("/").at(-1) ??
            project.path,
          path: `${args.projectPath}/${removeLeadingDirSlashes(project.path)}`,
        });
      }
    }
  } else {
    for (const ingredient of args.document.draft.ingredients) {
      if (
        ingredient.bookCode.trim().length > 0 &&
        ingredient.path.trim().length > 0
      ) {
        books.push({
          bookCode: ingredient.bookCode.toUpperCase(),
          title: ingredient.title || ingredient.bookCode,
          fileName:
            removeLeadingDirSlashes(ingredient.path).split("/").at(-1) ??
            ingredient.path,
          storageKey:
            removeLeadingDirSlashes(ingredient.path).split("/").at(-1) ??
            ingredient.path,
          path: `${args.projectPath}/${removeLeadingDirSlashes(ingredient.path)}`,
        });
      }
    }
  }

  const language =
    args.document.draft.kind === "resource-container"
      ? {
          code: args.document.draft.language.identifier,
          name: args.document.draft.language.title,
          direction:
            args.document.draft.language.direction === "rtl"
              ? LanguageDirection.RTL
              : LanguageDirection.LTR,
        }
      : {
          code: args.document.draft.language.tag,
          name: args.document.draft.language.englishName,
          direction:
            args.document.draft.language.direction === "rtl"
              ? LanguageDirection.RTL
              : LanguageDirection.LTR,
        };

  return {
    folderName,
    displayName: args.document.displayName,
    projectPath: args.projectPath,
    projectId: folderName,
    projectType:
      args.document.draft.kind === "resource-container"
        ? "resource-container"
        : "scripture-burrito",
    language,
    books,
    listBooks: async () => books,
    getBook: async () => {
      throw new Error(
        "Metadata review workspaces do not expose book reads before metadata is repaired.",
      );
    },
    saveBook: async () => {
      throw new Error(
        "Metadata review workspaces do not expose book writes before metadata is repaired.",
      );
    },
    addBook: async () => {
      throw new Error(
        "Metadata review workspaces do not expose book creation before metadata is repaired.",
      );
    },
    listVersions: async () => [],
    restoreVersion: async () => {
      throw new Error(
        "Version operations are not available until metadata issues are resolved.",
      );
    },
    stageAndCommit: async () => {
      throw new Error(
        "Git operations are not available until metadata issues are resolved.",
      );
    },
  };
}
