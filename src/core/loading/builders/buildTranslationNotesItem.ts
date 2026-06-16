import type { TranslationNotesItem } from "@/core/library/LibraryItem.ts";
import type { RemoteSyncCapabilitySource } from "@/core/library/LibraryItemCapabilities.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import { createPackedTranslationNotesBookFileName } from "@/core/library/stores/PackedTranslationNotesRepository.ts";

type ResourceForTypedBuild = Pick<
  LoadedReferenceItem,
  "descriptor" | "managedPath" | "listDocuments" | "readDocument"
> & {
  listDocuments?: () => Promise<readonly { id: string; name: string }[]>;
  readDocument?: (
    id: string,
  ) => Promise<{ id: string; name: string; contents: string }>;
  remoteSource?: RemoteSyncCapabilitySource;
  applyUpdates?: () => Promise<void>;
};

async function readBookFromResource(
  resource: ResourceForTypedBuild,
  bookCode: string,
): Promise<{
  bookCode: string;
  chapters: Record<string, Record<string, string>>;
} | null> {
  if (!resource.readDocument) return null;
  const docId = createPackedTranslationNotesBookFileName(bookCode);
  try {
    const doc = await resource.readDocument(docId);
    return JSON.parse(doc.contents);
  } catch {
    return null;
  }
}

/**
 * Builds the Translation Notes noun from a managed resource shape.
 *
 * The builder exposes book/chapter verbs that return raw markdown-friendly data
 * so the reference UI can render notes without generic resource branching.
 */
export function buildTranslationNotesItem(args: {
  resource: ResourceForTypedBuild;
  containerFormat: "resource-container" | "scripture-burrito";
}): TranslationNotesItem {
  const { resource, containerFormat } = args;

  return {
    id: resource.descriptor.id,
    displayName: resource.descriptor.displayName,
    managedPath: resource.managedPath,
    containerFormat,
    language: {
      code: resource.descriptor.language.code,
      name: resource.descriptor.language.name,
      direction: resource.descriptor.language.direction as "ltr" | "rtl",
    },
    capabilities: resource.remoteSource
      ? {
          remoteSync: {
            kind: "remoteSync",
            source: resource.remoteSource,
            applyUpdate: async () => {
              await resource.applyUpdates?.();
            },
          },
        }
      : {},
    type: "translationNotes",
    listBookCodes: async () => {
      if (resource.listDocuments) {
        const docs = await resource.listDocuments();
        return docs.map((d) => d.name);
      }
      return [];
    },
    readBook: async (bookCode: string) => {
      const book = await readBookFromResource(resource, bookCode);
      if (!book) return null;

      return {
        bookCode: book.bookCode,
        chapters: Object.entries(book.chapters)
          .map(([chapterNumber, verses]) => ({
            chapterNumber: Number(chapterNumber),
            verses: Object.entries(verses)
              .map(([verseNumber, rawMarkdown]) => ({
                verseNumber: Number(verseNumber),
                rawMarkdown,
              }))
              .sort((left, right) => left.verseNumber - right.verseNumber),
          }))
          .sort((left, right) => left.chapterNumber - right.chapterNumber),
      };
    },
    readChapter: async (bookCode: string, chapterNumber: number) => {
      const book = await readBookFromResource(resource, bookCode);
      if (!book) return null;
      const chapter = book.chapters[String(chapterNumber)];
      if (!chapter) return null;
      const verses: Record<string, string> = {};
      for (const [verseNumber, rawMarkdown] of Object.entries(chapter)) {
        verses[verseNumber] = rawMarkdown;
      }
      return verses;
    },
  };
}
