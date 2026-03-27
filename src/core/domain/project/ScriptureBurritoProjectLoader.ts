import { removeLeadingDirSlashes } from "@/core/data/utils/generic.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import {
    canonicalBookMap,
    generateUsfmFilename,
} from "@/core/domain/project/bookMapping.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";
import {
    attachRemoteSyncCapability,
    classifyResourceKindFromScriptureBurrito,
    toReferenceDocumentReference,
} from "@/core/domain/project/referenceItemLoading.ts";
import {
    createBurritoIngredient,
    updateBurritoMetadataFile,
} from "@/core/domain/project/scriptureBurritoHelpers.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import {
    createReferenceDocument,
    createReferenceDocumentId,
    type createReferenceDocumentReference,
} from "@/core/library/ReferenceDocuments.ts";
import {
    createPackedTranslationNotesBookFileName,
    createPackedTranslationNotesReadable,
    listPackedTranslationNotesBookCodes,
    readPackedTranslationNotesBook,
    readPackedTranslationNotesMetadata,
} from "@/core/library/stores/PackedTranslationNotesRepository.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import {
    type BookRef,
    type Project as PathProject,
    ScriptureWorkspaceType,
} from "@/core/persistence/ScriptureWorkspace.ts";
import {
    type BurritoLanguage,
    type Ingredient,
    type ScriptureBurritoMetadata,
    tryParseScriptureBurritoMetadata,
} from "./scriptureBurritoSchemas.ts";

function isBibleBookIngredient(
    _filePath: string,
    ingredient: Ingredient,
): boolean {
    if (ingredient.scope && typeof ingredient.scope === "object") {
        const bookCodes = Object.keys(ingredient.scope);
        return bookCodes.some((code) => /^[A-Z]{3}$/.test(code));
    }

    const scriptureMimeTypes = [
        "text/usfm",
        "text/usx",
        "application/xml",
        "text/plain",
    ];
    return scriptureMimeTypes.includes(ingredient.mimeType);
}

function extractBookCodeFromIngredient(
    filePath: string,
    ingredient: Ingredient,
): string | null {
    if (ingredient.scope && typeof ingredient.scope === "object") {
        const bookCodes = Object.keys(ingredient.scope);
        const validBookCode = bookCodes.find((code) => /^[A-Z]{3}$/.test(code));
        if (validBookCode) return validBookCode;
    }

    const filename = filePath.split("/").pop() || filePath;
    const match = filename.match(/(\d{2})-([A-Z]{3})\.(usfm|usx|txt)/i);
    return match ? match[2].toUpperCase() : null;
}

function getBookTitle(
    bookCode: string,
    metadata: ScriptureBurritoMetadata,
    langCode: string,
): string {
    if (metadata.localizedNames?.[`book-${bookCode.toLowerCase()}`]) {
        const nameObj =
            metadata.localizedNames[`book-${bookCode.toLowerCase()}`];
        return nameObj.short[langCode] || nameObj?.long?.[langCode] || bookCode;
    }

    return bookCode;
}

function getSortOrder(bookCode: string): number {
    const canonicalBook = canonicalBookMap[bookCode.toUpperCase()];
    return canonicalBook ? Number(canonicalBook.num) : 999;
}

function mapBurritoIngredientsToBookRefs(args: {
    metadata: ScriptureBurritoMetadata;
    projectRootPath: string;
    defaultLanguageTag: string;
}): BookRef[] {
    const books: BookRef[] = [];
    if (!args.metadata.ingredients) return books;

    for (const [filePath, ingredient] of Object.entries(
        args.metadata.ingredients,
    )) {
        if (!isBibleBookIngredient(filePath, ingredient)) continue;
        const bookCode = extractBookCodeFromIngredient(filePath, ingredient);
        if (!bookCode) continue;
        const title = getBookTitle(
            bookCode,
            args.metadata,
            args.defaultLanguageTag,
        );
        const relativePath = removeLeadingDirSlashes(filePath);
        const fileName = relativePath.split("/").pop() || relativePath;
        books.push({
            bookCode: bookCode.toUpperCase(),
            title,
            fileName,
            storageKey: fileName,
            path: `${args.projectRootPath}/${relativePath}`,
        });
    }

    return books.sort(
        (a, b) => getSortOrder(a.bookCode) - getSortOrder(b.bookCode),
    );
}

/**
 * Canonical metadata filename for Scripture Burrito containers.
 *
 * Import code and load code both rely on this shared filename when detecting
 * or opening Burrito-backed managed items.
 */
export const SCRIPTURE_BURRITO_METADATA_FILENAME = "metadata.json";

/**
 * Loader for Scripture Burrito-backed managed items.
 *
 * Like the RC loader, this runs strictly in the load phase. Import may have
 * already packed TN into book JSON or preserved scripture as-is, but this
 * loader's concern is simply: given a managed Burrito path, what typed/runtime
 * object should the app get back?
 */
export class ScriptureBurritoProjectLoader {
    static readonly METADATA_FILENAME = SCRIPTURE_BURRITO_METADATA_FILENAME;

    private readonly md5Service: IMd5Service;

    constructor(md5Service: IMd5Service) {
        this.md5Service = md5Service;
    }

    /**
     * Reopen a managed Burrito path as a loaded resource-compatible object.
     *
     * This is how read-only reference flows, packed TN loading, and generic
     * container classification all enter the Burrito world without yet assuming
     * the item is editable scripture.
     */
    async openResource(args: {
        fs: FileSystem;
        projectRootPath: string;
        folderName: string;
        displayName: string;
    }): Promise<LoadedReferenceItem | null> {
        const metadataPath = `${args.projectRootPath}/${ScriptureBurritoProjectLoader.METADATA_FILENAME}`;
        if (!(await args.fs.exists(metadataPath))) return null;

        try {
            const contents = await args.fs.readText(metadataPath);
            const rawMetadata = JSON.parse(contents);
            const [metadata] = tryParseScriptureBurritoMetadata(rawMetadata);
            if (!metadata) return null;

            const defaultLocale = metadata.meta.defaultLocale || "en";
            const fallbackLanguage: BurritoLanguage = {
                name: { en: "Unknown" },
                tag: "unknown",
                scriptDirection: "ltr",
            };
            const lang = metadata.languages?.[0] || fallbackLanguage;
            const defaultLanguageTag = lang.tag;
            const defaultLanguageName =
                lang.name[lang.tag] || lang.name[defaultLocale] || lang.tag;
            const documentEntries = Object.entries(metadata.ingredients ?? {})
                .map(([filePath, ingredient]) => {
                    const relativePath = removeLeadingDirSlashes(filePath);
                    const bookCode = extractBookCodeFromIngredient(
                        relativePath,
                        ingredient,
                    );
                    const name = bookCode
                        ? getBookTitle(bookCode, metadata, defaultLanguageTag)
                        : (relativePath.split("/").at(-1) ?? relativePath);

                    return {
                        relativePath,
                        ingredient,
                        bookCode,
                        document: toReferenceDocumentReference({
                            relativePath,
                            name,
                        }),
                    };
                })
                .filter(({ ingredient, bookCode }) =>
                    isBibleBookIngredient(bookCode ?? "", ingredient),
                );

            const metadataItemType = classifyResourceKindFromScriptureBurrito({
                abbreviation:
                    metadata.identification?.abbreviation?.[
                        defaultLanguageTag
                    ] ?? metadata.identification?.abbreviation?.[defaultLocale],
                name:
                    metadata.identification?.name[defaultLanguageTag] ??
                    metadata.identification?.name[defaultLocale] ??
                    args.folderName,
                subject:
                    metadata.subject?.[defaultLanguageTag] ??
                    metadata.subject?.[defaultLocale],
                flavorTypeName: metadata.type?.flavorType?.name,
            });
            const itemType = metadataItemType;

            const isTranslationNotesResource = itemType === "translationNotes";
            const packedTranslationNoteBookCodes = isTranslationNotesResource
                ? await listPackedTranslationNotesBookCodes({
                      fs: args.fs,
                      resourcePath: args.projectRootPath,
                  })
                : [];
            const packedMetadata = isTranslationNotesResource
                ? await readPackedTranslationNotesMetadata({
                      fs: args.fs,
                      resourcePath: args.projectRootPath,
                  })
                : null;
            const remoteSource = packedMetadata?.remoteSource;

            console.debug(
                `[ScriptureBurritoProjectLoader] Classified ${args.folderName} as ${itemType}.`,
            );
            if (remoteSource) {
                console.debug(
                    `[ScriptureBurritoProjectLoader] Remote source metadata detected for ${args.folderName}; sync capability will be attached.`,
                );
            } else {
                console.debug(
                    `[ScriptureBurritoProjectLoader] No remote source metadata found for ${args.folderName}.`,
                );
            }

            if (packedTranslationNoteBookCodes.length > 0) {
                console.debug(
                    `[ScriptureBurritoProjectLoader] Packed TN book files detected for ${args.folderName}: ${packedTranslationNoteBookCodes.join(", ")}.`,
                );
            }

            const resource: Omit<
                LoadedReferenceItem,
                "listDocuments" | "readDocument"
            > = {
                folderName: args.folderName,
                displayName: args.displayName,
                managedPath: args.projectRootPath,
                projectId:
                    metadata.identification?.name[defaultLanguageTag] ??
                    args.folderName,
                projectType:
                    ScriptureWorkspaceType.SCRIPTURE_BURRITO as ScriptureWorkspaceType,
                descriptor: {
                    id:
                        metadata.identification?.name[defaultLanguageTag] ??
                        args.folderName,
                    displayName: args.displayName,
                    type: itemType,
                    containerFormat: "scripture-burrito" as const,
                    language: {
                        code: defaultLanguageTag,
                        name: defaultLanguageName,
                        direction:
                            lang.scriptDirection === "rtl" ? "rtl" : "ltr",
                    },
                    readOnly: itemType !== "usfmScripture",
                },
            };

            if (packedTranslationNoteBookCodes.length > 0) {
                const packedDocuments = packedTranslationNoteBookCodes.map(
                    (bookCode) =>
                        ({
                            id: createReferenceDocumentId(
                                createPackedTranslationNotesBookFileName(
                                    bookCode,
                                ),
                            ),
                            name: bookCode,
                            browsePath: [bookCode],
                        }) satisfies ReturnType<
                            typeof createReferenceDocumentReference
                        >,
                );

                const packedResource = {
                    ...resource,
                    listDocuments: async () =>
                        packedDocuments.map((document) => ({ ...document })),
                    readDocument: async (documentId: string) => {
                        const match = packedDocuments.find(
                            (document) => document.id === documentId,
                        );
                        if (!match) {
                            throw new Error(
                                `No packed scripture burrito TN document found for id ${documentId}`,
                            );
                        }
                        const book = await readPackedTranslationNotesBook(
                            {
                                fs: args.fs,
                                resourcePath: args.projectRootPath,
                            },
                            match.name,
                        );
                        if (!book) {
                            throw new Error(
                                `No packed translation notes book found for ${match.name}`,
                            );
                        }

                        return createReferenceDocument({
                            ...match,
                            contents: JSON.stringify(book, null, 2),
                        });
                    },
                    ...createPackedTranslationNotesReadable({
                        fs: args.fs,
                        resourcePath: args.projectRootPath,
                    }),
                };
                if (!remoteSource) return packedResource;
                return attachRemoteSyncCapability(packedResource, remoteSource);
            }

            const rawResource = {
                ...resource,
                listDocuments: async () =>
                    documentEntries.map(({ document }) => ({ ...document })),
                readDocument: async (documentId: string) => {
                    const match = documentEntries.find(
                        ({ document }) => document.id === documentId,
                    );
                    if (!match) {
                        throw new Error(
                            `No scripture burrito document found for id ${documentId}`,
                        );
                    }
                    const contents = await args.fs.readText(
                        `${args.projectRootPath}/${match.relativePath}`,
                    );
                    return createReferenceDocument({
                        ...match.document,
                        id: createReferenceDocumentId(match.relativePath),
                        contents,
                    });
                },
            };
            if (!remoteSource) return rawResource;

            return attachRemoteSyncCapability(rawResource, remoteSource);
        } catch (error) {
            console.debug(
                `[ScriptureBurritoProjectLoader] Failed to open resource from ${SCRIPTURE_BURRITO_METADATA_FILENAME}: ${error}`,
            );
            return null;
        }
    }

    /**
     * Promote a managed Burrito path into the editable scripture project
     * contract when the metadata/classification says scripture and the managed
     * files still support the scripture workspace verbs.
     */
    async openProject(args: {
        fs: FileSystem;
        projectRootPath: string;
        folderName: string;
        displayName: string;
    }): Promise<PathProject | null> {
        const metadataPath = `${args.projectRootPath}/${ScriptureBurritoProjectLoader.METADATA_FILENAME}`;
        if (!(await args.fs.exists(metadataPath))) return null;

        try {
            const contents = await args.fs.readText(metadataPath);
            const rawMetadata = JSON.parse(contents);
            const [metadata] = tryParseScriptureBurritoMetadata(rawMetadata);
            if (!metadata) return null;

            const defaultLocale = metadata.meta.defaultLocale || "en";
            const fallbackLanguage: BurritoLanguage = {
                name: { en: "Unknown" },
                tag: "unknown",
                scriptDirection: "ltr",
            };
            const lang = metadata.languages?.[0] || fallbackLanguage;
            const defaultLanguageTag = lang.tag;
            const defaultLanguageName =
                lang.name[lang.tag] || lang.name[defaultLocale] || lang.tag;
            const defaultLanguageDirection =
                lang.scriptDirection === "rtl"
                    ? LanguageDirection.RTL
                    : LanguageDirection.LTR;

            const books = mapBurritoIngredientsToBookRefs({
                metadata,
                projectRootPath: args.projectRootPath,
                defaultLanguageTag,
            });

            const resolveIngredientPath = (
                storageKey: string,
            ): string | null => {
                for (const filePath of Object.keys(
                    metadata.ingredients || {},
                )) {
                    const relativePath = removeLeadingDirSlashes(filePath);
                    const fileName =
                        relativePath.split("/").pop() || relativePath;
                    if (fileName === storageKey) return relativePath;
                }
                return null;
            };

            const project: PathProject = {
                folderName: args.folderName,
                displayName: args.displayName,
                projectPath: args.projectRootPath,
                projectId:
                    metadata.identification?.name[defaultLanguageTag] ??
                    args.folderName,
                projectType: ScriptureWorkspaceType.SCRIPTURE_BURRITO,
                language: {
                    code: defaultLanguageTag,
                    name: defaultLanguageName,
                    direction:
                        defaultLanguageDirection === LanguageDirection.RTL
                            ? "rtl"
                            : "ltr",
                },
                books,
                listBooks: async () => [...books],
                getBook: async (storageKey) => {
                    const relativePath = resolveIngredientPath(storageKey);
                    if (!relativePath) {
                        throw new Error(
                            `No ingredient found for storage key ${storageKey}`,
                        );
                    }
                    const ingredient =
                        metadata.ingredients?.[relativePath] ??
                        metadata.ingredients?.[storageKey];
                    const bookCode = extractBookCodeFromIngredient(
                        relativePath,
                        ingredient as Ingredient,
                    );
                    if (!bookCode || !ingredient) {
                        throw new Error(
                            `Invalid ingredient for storage key ${storageKey}`,
                        );
                    }
                    const bookContents = await args.fs.readText(
                        `${args.projectRootPath}/${relativePath}`,
                    );
                    return {
                        bookCode,
                        title: getBookTitle(
                            bookCode,
                            metadata,
                            defaultLanguageTag,
                        ),
                        fileName: storageKey,
                        storageKey,
                        path: `${args.projectRootPath}/${relativePath}`,
                        contents: bookContents,
                    };
                },
                saveBook: async (storageKey, usfmText) => {
                    const relativePath = resolveIngredientPath(storageKey);
                    if (!relativePath) {
                        throw new Error(
                            `No ingredient found for storage key ${storageKey}`,
                        );
                    }
                    await args.fs.writeText(
                        `${args.projectRootPath}/${relativePath}`,
                        usfmText,
                    );
                    const ingredient =
                        metadata.ingredients?.[relativePath] ??
                        metadata.ingredients?.[storageKey];
                    const bookCode = ingredient
                        ? extractBookCodeFromIngredient(
                              relativePath,
                              ingredient,
                          )
                        : undefined;
                    const ingredientData = await createBurritoIngredient(
                        relativePath,
                        usfmText,
                        this.md5Service,
                        undefined,
                        bookCode ?? undefined,
                    );
                    if ("scope" in ingredientData && ingredient?.scope) {
                        ingredientData.scope = ingredient.scope;
                    }
                    await updateBurritoMetadataFile({
                        fs: args.fs,
                        metadataPath,
                        metadata,
                        filePath: relativePath,
                        ingredientData,
                    });
                },
                addBook: async (bookCode, opts) => {
                    const filename = generateUsfmFilename(bookCode);
                    if (metadata.ingredients?.[filename]) {
                        return {
                            bookCode,
                            title: opts?.localizedBookTitle || bookCode,
                            fileName: filename,
                            storageKey: filename,
                            path: `${args.projectRootPath}/${filename}`,
                        };
                    }

                    await args.fs.writeText(
                        `${args.projectRootPath}/${filename}`,
                        opts?.contents ?? "",
                    );
                    const ingredientData = await createBurritoIngredient(
                        filename,
                        opts?.contents ?? "",
                        this.md5Service,
                        opts?.localizedBookTitle,
                        bookCode,
                    );
                    await updateBurritoMetadataFile({
                        fs: args.fs,
                        metadataPath,
                        metadata,
                        filePath: filename,
                        ingredientData,
                    });
                    const nextBook = {
                        bookCode,
                        title: opts?.localizedBookTitle || bookCode,
                        fileName: filename,
                        storageKey: filename,
                        path: `${args.projectRootPath}/${filename}`,
                    };
                    const existingBookRefIndex = books.findIndex(
                        (candidate) => candidate.bookCode === nextBook.bookCode,
                    );
                    if (existingBookRefIndex >= 0) {
                        books[existingBookRefIndex] = nextBook;
                    } else {
                        books.push(nextBook);
                    }
                    return nextBook;
                },
                listVersions: async () => {
                    throw new Error(
                        "Version operations are not available on loader-opened projects.",
                    );
                },
                restoreVersion: async () => {
                    throw new Error(
                        "Version operations are not available on loader-opened projects.",
                    );
                },
                stageAndCommit: async () => {
                    throw new Error(
                        "Git operations are not available on loader-opened projects.",
                    );
                },
            };

            return project;
        } catch (error) {
            console.debug(
                `[ScriptureBurritoProjectLoader] Failed to open scripture project from ${SCRIPTURE_BURRITO_METADATA_FILENAME}: ${error}`,
            );
            return null;
        }
    }
}
