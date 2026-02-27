import { removeLeadingDirSlashes } from "@/core/data/utils/generic.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { canonicalBookMap } from "@/core/domain/project/bookMapping.ts";
import type { IProjectLoader } from "@/core/domain/project/IProjectLoader.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";
import {
    createBurritoIngredient,
    generateUsfmFilename,
    updateBurritoMetadata,
} from "@/core/domain/project/scriptureBurritoHelpers.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileWriter } from "@/core/io/IFileWriter.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";
import {
    type Ingredient,
    type ScriptureBurritoMetadata,
    tryParseScriptureBurritoMetadata,
} from "./scriptureBurritoSchemas.ts";

// Define a specific interface for Scripture Burrito Projects to include metadataJson
export interface ScriptureBurritoProject extends Project {
    metadataJson: ReturnType<typeof tryParseScriptureBurritoMetadata>[0] & {};
    md5Service: IMd5Service;
}

/**
 * Check if an ingredient represents a Bible book
 */
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

/**
 * Extract book code from ingredient scope or filename
 */
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

/**
 * Get book title from localizedNames or canonical mapping
 */
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

    return bookCode; // Fallback to book code
}

/**
 * Get sort order using canonical book mapping
 */
function getSortOrder(bookCode: string): number {
    const canonicalBook = canonicalBookMap[bookCode.toUpperCase()];
    return canonicalBook ? Number(canonicalBook.num) : 999;
}

/**
 * Map burrito ingredients to files array structure
 */
function mapBurritoIngredientsToFiles(
    metadata: ScriptureBurritoMetadata,
    projectDir: IDirectoryHandle,
    defaultLanguageTag: string,
): Array<{
    path: string;
    title: string;
    bookCode: string;
    nextBookId: null;
    prevBookId: null;
    sort: number;
}> {
    const files: Array<{
        path: string;
        title: string;
        bookCode: string;
        nextBookId: null;
        prevBookId: null;
        sort: number;
    }> = [];

    if (!metadata.ingredients) return files;

    for (const [filePath, ingredient] of Object.entries(metadata.ingredients)) {
        if (!isBibleBookIngredient(filePath, ingredient)) {
            continue;
        }

        const bookCode = extractBookCodeFromIngredient(filePath, ingredient);
        if (!bookCode) {
            continue;
        }

        const sort = getSortOrder(bookCode);
        const title = getBookTitle(bookCode, metadata, defaultLanguageTag);
        const fullPath = `${projectDir.path}/${removeLeadingDirSlashes(filePath)}`;

        files.push({
            path: fullPath,
            title,
            bookCode: bookCode.toUpperCase(),
            nextBookId: null,
            prevBookId: null,
            sort,
        });
    }

    return files.sort((a, b) => a.sort - b.sort);
}

/**
 * @class ScriptureBurritoProjectLoader
 * @implements {IProjectLoader}
 * @description Implements IProjectLoader for Scripture Burrito projects. It loads project data
 *              from a `metadata.json` file, extracts metadata, and provides functionality to add books
 *              as ingredients with MD5 checksums.
 */
export class ScriptureBurritoProjectLoader implements IProjectLoader {
    static readonly METADATA_FILENAME = "metadata.json";

    private readonly md5Service: IMd5Service;

    constructor(md5Service: IMd5Service) {
        this.md5Service = md5Service;
    }

    /**
     * @method loadProject
     * @description Loads a Scripture Burrito project from the specified directory handle.
     * @param projectDir - The IDirectoryHandle representing the project's root directory.
     * @param fileWriter - An IFileWriter instance for writing files within the project directory.
     * @param md5Service - An IMd5Service instance for calculating MD5 checksums for ingredients.
     * @returns A Promise that resolves to the loaded Project object, or null if the project cannot be loaded
     *          (e.g., metadata.json is missing or malformed).
     */
    async loadProject(
        projectDir: IDirectoryHandle,
        fileWriter: IFileWriter,
    ): Promise<ScriptureBurritoProject | null> {
        try {
            const metadataFileHandle = await projectDir.getFileHandle(
                ScriptureBurritoProjectLoader.METADATA_FILENAME,
            );
            const file = await metadataFileHandle.getFile();
            const contents = await file.text();
            const rawMetadata = JSON.parse(contents);

            // Validate metadata structure
            const [metadata] = tryParseScriptureBurritoMetadata(rawMetadata);
            if (!metadata) {
                return null;
            }
            const defaultLanguageTag = metadata.meta.defaultLocale || "en";
            const defaultLanguageName =
                metadata.languages?.find(
                    (lang) => lang.tag === defaultLanguageTag,
                )?.name[defaultLanguageTag] ?? "English";
            const defaultLanguageDirection =
                metadata.languages?.find(
                    (lang) => lang.tag === defaultLanguageTag,
                )?.scriptDirection === "rtl"
                    ? LanguageDirection.RTL
                    : LanguageDirection.LTR;

            const md5Service = this.md5Service;

            const project: ScriptureBurritoProject = {
                id:
                    metadata.identification?.name[defaultLanguageTag] ??
                    projectDir.name,
                name:
                    metadata.identification?.name[defaultLanguageTag] ??
                    projectDir.name,
                files: mapBurritoIngredientsToFiles(
                    metadata,
                    projectDir,
                    defaultLanguageTag,
                ),
                metadata: {
                    id: metadata.identification?.name[defaultLanguageTag] ?? "",
                    name:
                        metadata.identification?.name[defaultLanguageTag] ?? "",
                    language: {
                        id: defaultLanguageTag,
                        name: defaultLanguageName,
                        direction: defaultLanguageDirection,
                    },
                },
                projectDir,
                fileWriter,
                metadataJson: metadata,
                md5Service,
                /**
                 * @method addBook
                 * @description Adds a USFM book as an ingredient to the Scripture Burrito project. If the book already exists
                 *              (either as an ingredient in metadata.json or as a physical file), it will not be overwritten.
                 *              It automatically calculates and adds the MD5 checksum for the new book.
                 * @param bookCode - The three-letter book code (e.g., "MAT").
                 * @param localizedBookTitle - Optional. The localized title of book. Defaults to the book code.
                 * @param contents - Optional. The USFM content of book. Defaults to an empty string.
                 * @returns A Promise that resolves when the book is added and `metadata.json` is updated.
                 */
                addBook: async ({
                    bookCode,
                    localizedBookTitle,
                    contents = "",
                }: {
                    bookCode: string;
                    localizedBookTitle?: string;
                    contents?: string;
                }) => {
                    const filename = generateUsfmFilename(bookCode);
                    const filePath = filename; // Path relative to projectDir

                    if (project.metadataJson.ingredients?.[filePath]) {
                        return;
                    }

                    try {
                        const directoryHandle: IDirectoryHandle | null =
                            project.projectDir.asDirectoryHandle();
                        if (!directoryHandle) {
                            throw new Error(
                                `Project directory ${project.projectDir.path} is not a directory.`,
                            );
                        }
                        await directoryHandle.getFileHandle(filePath, {
                            create: false,
                        });
                        return;
                    } catch {
                        // File does not exist, proceed to create
                    }

                    await fileWriter.writeFile(filePath, contents);

                    const ingredientData = await createBurritoIngredient(
                        filePath,
                        contents,
                        md5Service,
                        localizedBookTitle,
                        bookCode,
                    );
                    await updateBurritoMetadata(
                        project,
                        filePath,
                        ingredientData,
                    );
                },
                /**
                 * @method getBook
                 * @description Retrieves the content of a specific book from the Scripture Burrito project.
                 * @param bookCode - The three-letter book code (e.g., "MAT").
                 * @returns A Promise that resolves to the content of book as a string, or null if the book is not found.
                 */
                getBook: async (bookCode: string): Promise<string | null> => {
                    const filename = generateUsfmFilename(bookCode);

                    if (
                        !project.metadataJson.ingredients ||
                        !project.metadataJson.ingredients[filename]
                    ) {
                        return null;
                    }

                    const directoryHandle: IDirectoryHandle | null =
                        project.projectDir.asDirectoryHandle();
                    if (!directoryHandle) {
                        console.error(
                            `Project directory ${project.projectDir.path} is not a directory.`,
                        );
                        return null;
                    }

                    try {
                        const fileHandle =
                            await directoryHandle.getFileHandle(filename);
                        const file = await fileHandle.getFile();
                        return await file.text();
                    } catch (error) {
                        console.debug(
                            `Could not read book file for ${bookCode} at path ${filename}: ${error}`,
                        );
                        return null;
                    }
                },
            };
            return project;
        } catch (error) {
            console.debug(`No metadata.json found or error parsing: ${error}`);
            return null;
        }
    }
}
