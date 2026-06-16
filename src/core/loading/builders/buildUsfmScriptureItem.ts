import type { UsfmScriptureItem } from "@/core/library/LibraryItem.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Builds the scripture noun from an editable scripture workspace.
 *
 * At this point import has already shaped the managed disk layout and loading
 * has already accounted for container format. This builder's job is only to
 * expose scripture-specific verbs for UI code that has narrowed to the
 * `usfmScripture` type.
 */
export function buildUsfmScriptureItem(args: {
  project: Project;
  containerFormat: "resource-container" | "scripture-burrito";
}): UsfmScriptureItem {
  const { project, containerFormat } = args;

  return {
    ...project,
    id: project.projectId ?? project.folderName,
    displayName: project.displayName,
    managedPath: project.projectPath,
    containerFormat,
    language: {
      code: project.language.code,
      name: project.language.name,
      direction: project.language.direction as "ltr" | "rtl",
    },
    capabilities: {
      editableWith: "usfmScripture",
    },
    type: "usfmScripture",
    readWorkspace: async () => {
      const firstBook = project.books[0];
      if (!firstBook) {
        return { bookCode: "", usfmContents: "" };
      }
      const book = await project.getBook(firstBook.storageKey);
      return {
        bookCode: firstBook.bookCode,
        usfmContents: book.contents,
      };
    },
    readBook: async (bookCode: string) => {
      const bookRef = project.books.find(
        (candidate) => candidate.bookCode === bookCode,
      );
      if (!bookRef) return null;
      const book = await project.getBook(bookRef.storageKey);
      return { bookCode, usfmContents: book.contents };
    },
  };
}
