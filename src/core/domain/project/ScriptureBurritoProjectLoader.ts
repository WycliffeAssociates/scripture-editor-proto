import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { IProjectLoader } from "@/core/domain/project/IProjectLoader.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";
import {
    createBurritoIngredient,
    generateUsfmFilename,
    updateBurritoMetadata,
} from "@/core/domain/project/scriptureBurritoHelpers.ts";
import type { IFileWriter } from "@/core/persistence/IFileWriter.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

/**
 * @class ScriptureBurritoProjectLoader
 * @implements {IProjectLoader}
 * @description Implements IProjectLoader for Scripture Burrito projects. It loads project data
 *              from a `metadata.json` file, extracts metadata, and provides functionality to add books
 *              as ingredients with MD5 checksums.
 */
export class ScriptureBurritoProjectLoader implements IProjectLoader {
    static readonly METADATA_FILENAME = "metadata.json";

    /**
     * @method loadProject
     * @description Loads a Scripture Burrito project from the specified directory handle.
     * @param projectDir - The FileSystemDirectoryHandle representing the project's root directory.
     * @param fileWriter - An IFileWriter instance for writing files within the project directory.
     * @param md5Service - An IMd5Service instance for calculating MD5 checksums for ingredients.
     * @returns A Promise that resolves to the loaded Project object, or null if the project cannot be loaded
     *          (e.g., metadata.json is missing or malformed).
     */
    async loadProject(
        projectDir: FileSystemDirectoryHandle,
        fileWriter: IFileWriter,
        md5Service: IMd5Service,
    ): Promise<Project | null> {
        try {
            const metadataFileHandle = await projectDir.getFileHandle(
                ScriptureBurritoProjectLoader.METADATA_FILENAME,
            );
            const file = await metadataFileHandle.getFile();
            const contents = await file.text();
            const metadata = JSON.parse(contents);

            const defaultLanguageTag =
                metadata.languages?.default?.tag || "und";
            const defaultLanguageName =
                metadata.languages?.[defaultLanguageTag]?.name?.en ||
                "Undefined";
            const defaultLanguageDirection =
                metadata.languages?.[defaultLanguageTag]?.direction === "rtl"
                    ? LanguageDirection.RTL
                    : LanguageDirection.LTR;

            const project: Project = {
                id: metadata.id || projectDir.name,
                name:
                    metadata.name ||
                    metadata.identification?.name?.en ||
                    projectDir.name,
                files: [],
                // path: projectDir.path || "", // Removed as FileSystemDirectoryHandle does not have a .path property
                metadata: {
                    id: metadata.id,
                    name: metadata.name || metadata.identification?.name?.en,
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
                 * @param localizedBookTitle - Optional. The localized title of the book. Defaults to the book code.
                 * @param contents - Optional. The USFM content of the book. Defaults to an empty string.
                 * @returns A Promise that resolves when the book is added and `metadata.json` is updated.
                 */
                addBook: async (
                    bookCode: string,
                    localizedBookTitle?: string,
                    contents: string = "",
                ) => {
                    const filename = generateUsfmFilename(bookCode);
                    const filePath = filename; // Path relative to projectDir

                    if (
                        project.metadataJson.ingredients &&
                        project.metadataJson.ingredients[filePath]
                    ) {
                        console.warn(
                            `Book ${filename} already exists as an ingredient. Not adding.`,
                        );
                        return;
                    }

                    try {
                        await projectDir.getFileHandle(filePath, {
                            create: false,
                        });
                        console.warn(
                            `Book ${filename} already exists as a file. Not adding.`,
                        );
                        return;
                    } catch {
                        // File does not exist, proceed to create
                    }

                    await fileWriter.writeFile(filePath, contents);

                    const ingredientData = createBurritoIngredient(
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
                    console.log(
                        `Added ${filename} as ingredient to metadata.json`,
                    );
                },
            };
            return project;
        } catch (error) {
            console.debug(`No metadata.json found or error parsing: ${error}`);
            return null;
        }
    }
}
