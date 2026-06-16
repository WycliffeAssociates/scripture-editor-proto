import { t } from "@lingui/core/macro";

import { sortListByBookCanonical } from "@/core/data/bible/bible.ts";
import { canonicalBookMap } from "@/core/domain/project/bookMapping.ts";
import {
  classifyResourceKindFromResourceContainer,
  classifyResourceKindFromScriptureBurrito,
} from "@/core/domain/project/referenceItemLoading.ts";
import { parseResourceContainer } from "@/core/domain/project/resourceContainer/resourceContainer.ts";
import { SCRIPTURE_BURRITO_METADATA_FILENAME } from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import { tryParseScriptureBurritoMetadata } from "@/core/domain/project/scriptureBurritoSchemas.ts";
import type {
  ImportBrowserDirectorySource,
  ImportBrowserFileSource,
  ImportProjectOptions,
  ImportProjectResult,
} from "@/core/library/ImportService.ts";
import {
  createImportProgressUpdate,
  ImportProgressPhase,
} from "@/core/library/ImportService.ts";
import type { IndexedLibraryItemType } from "@/core/library/LibraryItemType.ts";
import {
  createPackedTranslationNotesBook,
  createPackedTranslationNotesBookFileName,
  createPackedTranslationNotesMetadataFileName,
  normalizeTranslationNotesBookCode,
} from "@/core/library/stores/PackedTranslationNotesRepository.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import {
  basenameStoragePath,
  joinStoragePath,
  normalizeStoragePath,
} from "@/core/persistence/pathUtils.ts";
import { shouldStripPortableProjectPath } from "@/core/persistence/portableProjectSanitization.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";

/**
 * Web-specific import helpers for browser-provided `File` and `FileList`
 * objects.
 *
 * Browser uploads are the one import path where the app receives bytes before a
 * real directory exists on disk. This module handles that browser-only staging
 * work, then writes the same managed storage shapes the rest of the app expects
 * to load later.
 */
const DEFAULT_UPLOAD_COPY_CONCURRENCY =
  typeof navigator !== "undefined" &&
  typeof navigator.hardwareConcurrency === "number" &&
  Number.isFinite(navigator.hardwareConcurrency)
    ? Math.max(1, Math.floor(navigator.hardwareConcurrency / 2))
    : 4;

type UploadedDirectoryEntry = {
  file: File;
  relativePath: string;
};

type PackedUploadedTranslationNotesBook = {
  bookCode: string;
  chapters: Record<string, Record<string, string>>;
};

type UploadedResourceMetadata = {
  itemType: IndexedLibraryItemType;
};

type BrowserImportArgs = {
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  projectsService: ProjectsService;
  onProgress?: ImportProjectOptions["onProgress"];
};

async function readUploadedFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new TextDecoder().decode(await file.arrayBuffer());
}

async function resolveUploadedProjectDirectory(args: {
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  initialName: string;
}): Promise<string> {
  // Browser imports still land in the same managed library root as desktop
  // imports, so they need the same "pick a unique sibling folder" behavior.
  let counter = 0;
  let candidateName = args.initialName;
  let candidatePath = joinStoragePath(
    args.storageRoots.projectsRoot,
    candidateName,
  );

  while (await args.fileSystem.exists(candidatePath)) {
    counter += 1;
    candidateName = `${args.initialName} (${counter})`;
    candidatePath = joinStoragePath(
      args.storageRoots.projectsRoot,
      candidateName,
    );
  }

  return candidatePath;
}

function collectUploadedDirectoryEntries(
  files: FileList,
): UploadedDirectoryEntry[] {
  // `webkitRelativePath` is the only folder context browsers give us. Rebuild
  // the tree here so later code can reason about real relative paths.
  const entries: UploadedDirectoryEntry[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relativePath = file.webkitRelativePath.split("/").slice(1).join("/");
    if (!relativePath || shouldStripPortableProjectPath(relativePath)) {
      continue;
    }

    entries.push({ file, relativePath });
  }

  return entries;
}

async function copyUploadedDirectoryEntries(args: {
  fileSystem: FileSystem;
  destinationDir: string;
  entries: UploadedDirectoryEntry[];
}): Promise<void> {
  // Non-TN uploads preserve source layout, so this path is a bounded-concurrency
  // byte copy from browser files into managed storage.
  const { entries, fileSystem, destinationDir } = args;
  if (entries.length === 0) {
    return;
  }

  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= entries.length) {
        return;
      }

      const { file, relativePath } = entries[currentIndex];
      await fileSystem.writeBytes(
        joinStoragePath(destinationDir, relativePath),
        new Uint8Array(await file.arrayBuffer()),
      );
    }
  };

  const workerCount = Math.min(DEFAULT_UPLOAD_COPY_CONCURRENCY, entries.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function resolveUploadedResourceMetadata(
  entries: UploadedDirectoryEntry[],
): Promise<UploadedResourceMetadata | null> {
  // Read the container metadata before writing the final shape so web imports
  // make the same type decision the desktop/native path makes.
  const manifestEntry = entries.find(
    (entry) => entry.relativePath === "manifest.yaml",
  );
  if (manifestEntry) {
    const manifest = parseResourceContainer(
      await readUploadedFileText(manifestEntry.file),
    );
    return {
      itemType: classifyResourceKindFromResourceContainer({
        identifier: manifest.dublin_core?.identifier,
        title: manifest.dublin_core?.title,
        subject: manifest.dublin_core?.subject,
        format: manifest.dublin_core?.format,
      }),
    };
  }

  const metadataEntry = entries.find(
    (entry) => entry.relativePath === SCRIPTURE_BURRITO_METADATA_FILENAME,
  );
  if (metadataEntry) {
    const [metadata] = tryParseScriptureBurritoMetadata(
      JSON.parse(await readUploadedFileText(metadataEntry.file)),
    );
    if (!metadata) {
      return null;
    }

    const defaultLocale = metadata.meta.defaultLocale || "en";
    return {
      itemType: classifyResourceKindFromScriptureBurrito({
        abbreviation: metadata.identification?.abbreviation?.[defaultLocale],
        name: metadata.identification?.name[defaultLocale],
        subject: metadata.subject?.[defaultLocale],
        flavorTypeName: metadata.type?.flavorType?.name,
      }),
    };
  }

  return null;
}

function isTranslationNotesUpload(
  metadata: UploadedResourceMetadata | null,
): boolean {
  return metadata?.itemType === "translationNotes";
}

function parseUploadedTranslationNotePath(relativePath: string): {
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
} | null {
  // TN uploads arrive as verse markdown files nested under book/chapter
  // folders. Convert that relative path into the keys the packed book format
  // expects.
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length < 3) {
    return null;
  }

  const bookCode = normalizeTranslationNotesBookCode(parts[0]);
  if (!canonicalBookMap[bookCode]) {
    return null;
  }

  const chapterNumber = Number.parseInt(parts[1] ?? "", 10);

  const verseNumberRegex = /^\d+(?:\.\d+)?$/u;
  const verseNumber = Number.parseInt(
    (parts[2] ?? "").replace(verseNumberRegex, ""),
    10,
  );
  if (!Number.isFinite(chapterNumber) || !Number.isFinite(verseNumber)) {
    return null;
  }

  return { bookCode, chapterNumber, verseNumber };
}

async function writeUploadedTranslationNotesDirectory(args: {
  fileSystem: FileSystem;
  destinationDir: string;
  entries: UploadedDirectoryEntry[];
  onProgress?: ImportProjectOptions["onProgress"];
}): Promise<void> {
  // TN is the one import type that intentionally does not preserve its raw
  // verse-file layout. We copy support files through, then gather each book
  // into memory and write a single `{book}.json`.
  const supportEntries: UploadedDirectoryEntry[] = [];
  const books = new Map<string, PackedUploadedTranslationNotesBook>();

  for (const entry of args.entries) {
    const notePath = parseUploadedTranslationNotePath(entry.relativePath);
    if (!notePath) {
      supportEntries.push(entry);
      continue;
    }

    const existing =
      books.get(notePath.bookCode) ??
      ({
        bookCode: notePath.bookCode,
        chapters: {},
      } satisfies PackedUploadedTranslationNotesBook);
    const chapterKey = String(notePath.chapterNumber);
    existing.chapters[chapterKey] ??= {};
    existing.chapters[chapterKey][String(notePath.verseNumber)] =
      await readUploadedFileText(entry.file);
    books.set(notePath.bookCode, existing);
  }

  for (const entry of supportEntries) {
    await args.fileSystem.writeBytes(
      joinStoragePath(args.destinationDir, entry.relativePath),
      new Uint8Array(await entry.file.arrayBuffer()),
    );
  }

  const sortedBooks = sortListByBookCanonical(
    [...books.values()],
    (book) => book.bookCode,
  );

  await args.onProgress?.(
    createImportProgressUpdate(
      ImportProgressPhase.RESHAPE_RESOURCE,
      t`${0}/${sortedBooks.length} books`,
      {
        current: 0,
        total: sortedBooks.length,
      },
    ),
  );

  let completedBooks = 0;
  for (const book of sortedBooks) {
    await args.fileSystem.writeText(
      joinStoragePath(
        args.destinationDir,
        createPackedTranslationNotesBookFileName(book.bookCode),
      ),
      JSON.stringify(
        createPackedTranslationNotesBook({
          bookCode: book.bookCode,
          chapters: book.chapters,
        }),
        null,
        2,
      ),
    );
    completedBooks += 1;
    await args.onProgress?.(
      createImportProgressUpdate(
        ImportProgressPhase.RESHAPE_RESOURCE,
        t`${completedBooks}/${sortedBooks.length} books`,
        {
          current: completedBooks,
          total: sortedBooks.length,
        },
      ),
    );
  }
}

async function importBrowserDirectory(
  source: ImportBrowserDirectorySource,
  args: BrowserImportArgs,
): Promise<ImportProjectResult> {
  const uploadedEntries = collectUploadedDirectoryEntries(source.files);
  // resolveUploadedProjectDirectory is read-only (probes via fs.exists) so it
  // can race with resolveUploadedResourceMetadata.
  const [uploadedResourceMetadata, finalProjectDir] = await Promise.all([
    resolveUploadedResourceMetadata(uploadedEntries),
    resolveUploadedProjectDirectory({
      fileSystem: args.fileSystem,
      storageRoots: args.storageRoots,
      initialName: basenameStoragePath(source.folderName),
    }),
  ]);
  await args.fileSystem.mkdir(finalProjectDir, { recursive: true });
  const shouldPackTranslationNotes = isTranslationNotesUpload(
    uploadedResourceMetadata,
  );

  if (!shouldPackTranslationNotes) {
    await args.onProgress?.(
      createImportProgressUpdate(
        ImportProgressPhase.COPY_CONTENT,
        t`Copying uploaded folder into app storage (0/${uploadedEntries.length})...`,
        {
          current: 0,
          total: uploadedEntries.length,
        },
      ),
    );
  }

  let importCompleted = false;
  try {
    if (shouldPackTranslationNotes) {
      await writeUploadedTranslationNotesDirectory({
        fileSystem: args.fileSystem,
        destinationDir: finalProjectDir,
        entries: uploadedEntries.filter(
          (entry) =>
            entry.relativePath !==
            createPackedTranslationNotesMetadataFileName(),
        ),
        onProgress: args.onProgress,
      });
    } else {
      await copyUploadedDirectoryEntries({
        fileSystem: args.fileSystem,
        destinationDir: finalProjectDir,
        entries: uploadedEntries,
      });
    }

    const importedProject = await args.projectsService.importProject(
      {
        type: "fromPreparedDir",
        directoryPath: finalProjectDir,
      },
      { onProgress: args.onProgress },
    );
    importCompleted = true;
    return importedProject;
  } finally {
    if (!importCompleted) {
      try {
        await args.fileSystem.remove(finalProjectDir, {
          recursive: true,
        });
      } catch (error) {
        console.error("Failed to clean up partially imported directory", error);
      }
    }
  }
}

async function importBrowserZip(
  source: ImportBrowserFileSource,
  args: BrowserImportArgs,
): Promise<ImportProjectResult> {
  const tempFilePath = normalizeStoragePath(
    await args.fileSystem.createTempFile("import-", `-${source.file.name}`),
  );

  try {
    await args.onProgress?.(
      createImportProgressUpdate(
        ImportProgressPhase.READ_SOURCE,
        t`Staging uploaded file ${source.file.name}...`,
      ),
    );
    const content = await source.file.arrayBuffer();
    await args.fileSystem.writeBytes(tempFilePath, new Uint8Array(content));
    const importedProject = await args.projectsService.importProject(
      {
        type: "fromZipFile",
        filePath: tempFilePath,
      },
      { onProgress: args.onProgress },
    );
    return importedProject;
  } finally {
    try {
      await args.fileSystem.remove(tempFilePath, { recursive: false });
    } catch (error) {
      console.error("Failed to clean up temporary file", error);
    }
  }
}

export async function importBrowserDirectorySource(
  source: ImportBrowserDirectorySource,
  args: BrowserImportArgs,
): Promise<ImportProjectResult> {
  return await importBrowserDirectory(source, args);
}

export async function importBrowserZipSource(
  source: ImportBrowserFileSource,
  args: BrowserImportArgs,
): Promise<ImportProjectResult> {
  return await importBrowserZip(source, args);
}
