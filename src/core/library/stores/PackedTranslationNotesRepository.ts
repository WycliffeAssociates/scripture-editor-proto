import * as v from "valibot";
import { canonicalBookMap } from "@/core/domain/project/bookMapping.ts";
import type { RemoteSourceMetadata } from "@/core/library/ReferenceItemSupport.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import {
    joinStoragePath,
    stripFileExtension,
} from "@/core/persistence/pathUtils.ts";

/**
 * Repository for the packed Translation Notes runtime/disk shape.
 *
 * Import writes this shape after classifying an incoming source as
 * `translationNotes`. Loaders then attach typed TN read verbs by delegating to
 * this repository. UI renders raw markdown returned by those verbs.
 */

/**
 * Verse bodies keyed by verse number within a single chapter.
 *
 * The repository deliberately stores raw markdown strings here. Parsing and
 * rendering happen later in the UI-facing TN path; we do not invent a second
 * structured note model at the storage seam.
 */
export type PackedTranslationNotesVerseMap = Record<string, string>;

/**
 * Chapters keyed by chapter number within a single book file.
 */
export type PackedTranslationNotesChapterMap = Record<
    string,
    PackedTranslationNotesVerseMap
>;

/**
 * Canonical on-disk payload for one packed TN book file.
 *
 * Import writes one of these per canonical Bible book rather than thousands of
 * verse files. Loaders and reference UI then lazily read the specific book they
 * need.
 */
export type PackedTranslationNotesBook = {
    bookCode: string;
    chapters: PackedTranslationNotesChapterMap;
};

/**
 * Companion metadata written alongside packed TN books.
 *
 * This is where import preserves remote update origin without conflating it
 * with container metadata like `manifest.yaml` or `metadata.json`.
 */
export type PackedTranslationNotesMetadata = {
    remoteSource?: RemoteSourceMetadata;
};

/**
 * Minimal read interface loaders attach to TN-backed loaded items.
 *
 * UI should get to ask for book codes and read one packed book without knowing
 * anything about where the JSON lives on disk.
 */
export interface PackedTranslationNotesReadable {
    listTranslationNotesBookCodes(): Promise<readonly string[]>;
    readPackedTranslationNotesBook(
        bookCode: string,
    ): Promise<PackedTranslationNotesBook | null>;
}

/**
 * Filename for packed TN remote/update metadata kept next to the book files.
 */
export function createPackedTranslationNotesMetadataFileName(): string {
    return "translation-notes.metadata.json";
}

function getCanonicalPackedBookOrder(bookCode: string): number {
    const book = canonicalBookMap[bookCode.toUpperCase()];
    if (!book) return Number.MAX_SAFE_INTEGER;
    return Number.parseInt(book.num, 10);
}

function normalizePackedTranslationNotesKey(value: string): string {
    return value.trim();
}

function normalizePackedTranslationNotesVerseMap(
    verses: PackedTranslationNotesVerseMap,
): PackedTranslationNotesVerseMap {
    const normalizedVerses: PackedTranslationNotesVerseMap = {};

    for (const [verseNumber, body] of Object.entries(verses)) {
        const normalizedVerseNumber =
            normalizePackedTranslationNotesKey(verseNumber);
        if (!normalizedVerseNumber) continue;
        normalizedVerses[normalizedVerseNumber] = body;
    }

    return normalizedVerses;
}

export function normalizeTranslationNotesBookCode(bookCode: string): string {
    return bookCode.trim().toUpperCase();
}

/**
 * Resolve the packed filename for a canonical book code.
 *
 * Import and load both use the same helper so they agree on book-file naming.
 */
export function createPackedTranslationNotesBookFileName(
    bookCode: string,
): string {
    return `${normalizeTranslationNotesBookCode(bookCode).toLowerCase()}.json`;
}

/**
 * Normalize a packed book payload before it is written or returned to callers.
 *
 * This keeps chapter and verse keys trimmed/canonical so read paths are not
 * forced to defend against multiple equivalent key spellings.
 */
export function createPackedTranslationNotesBook(
    book: PackedTranslationNotesBook,
): PackedTranslationNotesBook {
    const normalizedChapters: PackedTranslationNotesChapterMap = {};

    for (const [chapterNumber, verses] of Object.entries(book.chapters)) {
        const normalizedChapterNumber =
            normalizePackedTranslationNotesKey(chapterNumber);
        if (!normalizedChapterNumber) continue;
        normalizedChapters[normalizedChapterNumber] =
            normalizePackedTranslationNotesVerseMap(verses);
    }

    return {
        bookCode: normalizeTranslationNotesBookCode(book.bookCode),
        chapters: normalizedChapters,
    };
}

/**
 * Read one chapter's verse map from a packed book payload.
 */
export function readPackedTranslationNotesChapter(args: {
    book: PackedTranslationNotesBook;
    chapterNumber: number;
}): PackedTranslationNotesVerseMap | null {
    return args.book.chapters[String(args.chapterNumber)] ?? null;
}

/**
 * Read one verse body from a packed book payload.
 */
export function readPackedTranslationNotesVerse(args: {
    book: PackedTranslationNotesBook;
    chapterNumber: number;
    verseNumber: number;
}): string | null {
    return (
        readPackedTranslationNotesChapter(args)?.[String(args.verseNumber)] ??
        null
    );
}

const RemoteSourceMetadataSchema = v.object({
    kind: v.picklist(["git", "url", "unknown"]),
    identifier: v.string(),
    ref: v.optional(v.string()),
    shallowClone: v.boolean(),
});

const PackedTranslationNotesMetadataSchema = v.object({
    remoteSource: v.optional(RemoteSourceMetadataSchema),
});

const PackedTranslationNotesBookSchema = v.object({
    bookCode: v.string(),
    chapters: v.record(v.string(), v.record(v.string(), v.string())),
});

/**
 * Attach the repository-backed read verbs used by TN loaded items.
 */
export function createPackedTranslationNotesReadable(args: {
    fs: FileSystem;
    resourcePath: string;
}): PackedTranslationNotesReadable {
    return {
        listTranslationNotesBookCodes: async () =>
            listPackedTranslationNotesBookCodes(args),
        readPackedTranslationNotesBook: async (bookCode) =>
            readPackedTranslationNotesBook(args, bookCode),
    };
}

/**
 * Read the optional TN companion metadata file if one exists.
 */
export async function readPackedTranslationNotesMetadata(args: {
    fs: FileSystem;
    resourcePath: string;
}): Promise<PackedTranslationNotesMetadata | null> {
    const metadataPath = joinStoragePath(
        args.resourcePath,
        createPackedTranslationNotesMetadataFileName(),
    );
    if (!(await args.fs.exists(metadataPath))) {
        return null;
    }

    return v.parse(
        PackedTranslationNotesMetadataSchema,
        JSON.parse(await args.fs.readText(metadataPath)),
    ) as PackedTranslationNotesMetadata;
}

/**
 * Enumerate canonical packed TN book codes from the managed resource path.
 *
 * This intentionally ignores non-book JSON files such as companion metadata.
 */
export async function listPackedTranslationNotesBookCodes(args: {
    fs: FileSystem;
    resourcePath: string;
}): Promise<string[]> {
    const entries = await args.fs.list(args.resourcePath);
    return entries
        .filter(
            (entry) =>
                entry.kind === "file" &&
                entry.name.toLowerCase().endsWith(".json"),
        )
        .map((entry) =>
            normalizeTranslationNotesBookCode(stripFileExtension(entry.name)),
        )
        .filter((bookCode) => Boolean(canonicalBookMap[bookCode]))
        .sort((left, right) => {
            const leftOrder = getCanonicalPackedBookOrder(left);
            const rightOrder = getCanonicalPackedBookOrder(right);
            return leftOrder - rightOrder || left.localeCompare(right);
        });
}

/**
 * Read and validate one packed TN book file from managed storage.
 */
export async function readPackedTranslationNotesBook(
    args: {
        fs: FileSystem;
        resourcePath: string;
    },
    bookCode: string,
): Promise<PackedTranslationNotesBook | null> {
    const normalizedBookCode = normalizeTranslationNotesBookCode(bookCode);
    const filePath = joinStoragePath(
        args.resourcePath,
        createPackedTranslationNotesBookFileName(normalizedBookCode),
    );
    if (!(await args.fs.exists(filePath))) {
        return null;
    }

    const contents = await args.fs.readText(filePath);
    return createPackedTranslationNotesBook(
        v.parse(
            PackedTranslationNotesBookSchema,
            JSON.parse(contents),
        ) as PackedTranslationNotesBook,
    );
}

/**
 * Runtime type guard for older loaded-resource values that may have the packed
 * TN read verbs attached.
 */
export function isPackedTranslationNotesReadable(
    value: unknown,
): value is PackedTranslationNotesReadable {
    return (
        typeof value === "object" &&
        value !== null &&
        "listTranslationNotesBookCodes" in value &&
        typeof (
            value as {
                listTranslationNotesBookCodes?: unknown;
            }
        ).listTranslationNotesBookCodes === "function" &&
        "readPackedTranslationNotesBook" in value &&
        typeof (
            value as {
                readPackedTranslationNotesBook?: unknown;
            }
        ).readPackedTranslationNotesBook === "function"
    );
}

export async function packTranslationNotesDirectory(args: {
    fs: FileSystem;
    resourcePath: string;
    remoteSource?: RemoteSourceMetadata;
    onProgress?: (update: {
        phase: "reshape-resource";
        message: string;
        current?: number;
        total?: number;
    }) => void | Promise<void>;
}): Promise<void> {
    const resourceDirName = args.resourcePath.split("/").filter(Boolean).at(-1);
    if (!resourceDirName) {
        throw new Error("Unable to resolve translation notes resource name.");
    }

    const parentPath = args.resourcePath
        .split("/")
        .filter(Boolean)
        .slice(0, -1)
        .join("/");
    const parentDirPath = parentPath ? `/${parentPath}` : "/";
    const packedTempPath = joinStoragePath(
        parentDirPath,
        `${resourceDirName}.packed-${Date.now()}`,
    );
    const rawBackupPath = joinStoragePath(
        parentDirPath,
        `${resourceDirName}.raw-${Date.now()}`,
    );

    await args.fs.mkdir(packedTempPath, { recursive: true });

    try {
        const collected = await collectRawTranslationNotesArtifacts(
            args.fs,
            args.resourcePath,
        );
        const remoteSource = args.remoteSource;
        if (remoteSource) {
            await args.fs.writeText(
                joinStoragePath(
                    packedTempPath,
                    createPackedTranslationNotesMetadataFileName(),
                ),
                JSON.stringify(
                    {
                        remoteSource,
                    } satisfies PackedTranslationNotesMetadata,
                    null,
                    2,
                ),
            );
        }
        for (const supportFile of collected.supportFiles) {
            await args.fs.writeBytes(
                joinStoragePath(packedTempPath, supportFile.outputName),
                await args.fs.readBytes(supportFile.sourcePath),
            );
        }
        const bookCodes = [
            ...new Set(collected.map((entry) => entry.bookCode)),
        ].sort(
            (left, right) =>
                getCanonicalPackedBookOrder(left) -
                    getCanonicalPackedBookOrder(right) ||
                left.localeCompare(right),
        );

        await args.onProgress?.({
            phase: "reshape-resource",
            message: `${0}/${bookCodes.length} books`,
            current: 0,
            total: bookCodes.length,
        });

        let writtenBooks = 0;
        for (const bookCode of bookCodes) {
            const bookEntries = collected.filter(
                (entry) => entry.bookCode === bookCode,
            );
            const packedBook = createPackedTranslationNotesBook({
                bookCode,
                chapters: bookEntries.reduce<PackedTranslationNotesChapterMap>(
                    (chapters, entry) => {
                        const chapterKey = String(entry.chapterNumber);
                        chapters[chapterKey] ??= {};
                        const verseKey = String(entry.verseNumber);
                        if (Object.hasOwn(chapters[chapterKey], verseKey)) {
                            throw new Error(
                                `Duplicate translation notes entry for ${bookCode} ${entry.chapterNumber}:${entry.verseNumber}`,
                            );
                        }
                        chapters[chapterKey][verseKey] = entry.body;
                        return chapters;
                    },
                    {},
                ),
            });

            await args.fs.writeText(
                joinStoragePath(
                    packedTempPath,
                    createPackedTranslationNotesBookFileName(bookCode),
                ),
                JSON.stringify(packedBook, null, 2),
            );

            writtenBooks += 1;
            await args.onProgress?.({
                phase: "reshape-resource",
                message: `${writtenBooks}/${bookCodes.length} books`,
                current: writtenBooks,
                total: bookCodes.length,
            });
        }

        await args.fs.move(args.resourcePath, rawBackupPath);
        await args.fs.move(packedTempPath, args.resourcePath);
        await args.fs.remove(rawBackupPath, { recursive: true });
    } catch (error) {
        if (await args.fs.exists(packedTempPath)) {
            await args.fs.remove(packedTempPath, { recursive: true });
        }
        throw error;
    }
}

type RawTranslationNoteEntry = {
    bookCode: string;
    chapterNumber: number;
    verseNumber: number;
    sourcePath: string;
    body: string;
};

type TranslationNotesSupportFile = {
    sourcePath: string;
    outputName: string;
};

type CollectedTranslationNotesArtifacts = RawTranslationNoteEntry[] & {
    supportFiles: TranslationNotesSupportFile[];
};

function parseTranslationNotePath(relativePath: string): {
    bookCode: string;
    chapterNumber: number;
    verseNumber: number;
} | null {
    const normalizedPath = relativePath.replace(/^\/+/u, "");
    const segments = normalizedPath.split("/");
    if (segments.length !== 3) return null;
    const [bookSegment, chapterSegment, verseSegment] = segments;
    const bookCode = normalizeTranslationNotesBookCode(bookSegment);
    const chapterNumber = Number.parseInt(chapterSegment, 10);
    const verseNumber = Number.parseInt(stripFileExtension(verseSegment), 10);
    if (
        !canonicalBookMap[bookCode] ||
        Number.isNaN(chapterNumber) ||
        Number.isNaN(verseNumber)
    ) {
        return null;
    }

    return {
        bookCode,
        chapterNumber,
        verseNumber,
    };
}

async function collectRawTranslationNotesArtifacts(
    fs: FileSystem,
    resourcePath: string,
): Promise<CollectedTranslationNotesArtifacts> {
    const entries = [] as unknown as CollectedTranslationNotesArtifacts;
    entries.supportFiles = [];

    async function walk(currentPath: string, relativePath = ""): Promise<void> {
        const directoryEntries = await fs.list(currentPath);

        for (const entry of directoryEntries) {
            const entryRelativePath = relativePath
                ? `${relativePath}/${entry.name}`
                : entry.name;

            if (entry.kind === "directory") {
                await walk(entry.path, entryRelativePath);
                continue;
            }

            if (entry.name === createPackedTranslationNotesMetadataFileName()) {
                continue;
            }

            const parsedPath = parseTranslationNotePath(entryRelativePath);
            if (!parsedPath) {
                entries.supportFiles.push({
                    sourcePath: entry.path,
                    outputName: entry.name,
                });
                continue;
            }

            entries.push({
                ...parsedPath,
                sourcePath: entry.path,
                body: await fs.readText(entry.path),
            });
        }
    }

    await walk(resourcePath);
    return entries;
}
