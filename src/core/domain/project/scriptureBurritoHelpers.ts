import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { canonicalBookMap } from "@/core/domain/project/bookMapping.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

/**
 * @function generateUsfmFilename
 * @description Generates a canonical USFM filename based on the book code.
 *              The format is "{canonical book number, 0 padded to 2 digits}-{book code, in caps}.usfm".
 * @param bookCode - The three-letter book code (e.g., "MAT").
 * @returns The generated USFM filename.
 * @throws {Error} If an invalid book code is provided.
 */
export function generateUsfmFilename(bookCode: string): string {
    const book = canonicalBookMap[bookCode.toUpperCase()];
    if (!book) {
        throw new Error(`Invalid book code: ${bookCode}`);
    }
    return `${book.num}-${book.code}.usfm`;
}

/**
 * @function createBurritoIngredient
 * @description Creates a Scripture Burrito ingredient object for a given file.
 * @param filePath - The relative path of the file within the project.
 * @param contents - The content of the file.
 * @param md5Service - An IMd5Service instance to calculate the MD5 checksum.
 * @param localizedBookTitle - Optional. The localized title of the book.
 * @param bookCode - Optional. The book code, used if localizedBookTitle is not provided.
 * @returns A JavaScript object representing the Burrito ingredient.
 */
export function createBurritoIngredient(
    filePath: string,
    contents: string,
    md5Service: IMd5Service,
    localizedBookTitle?: string,
    bookCode?: string,
) {
    const md5Checksum = md5Service.calculateMd5(contents);
    return {
        checksum: {
            md5: md5Checksum,
        },
        size: contents.length,
        mimeType: "text/usfm",
        title: localizedBookTitle || bookCode || filePath,
    };
}

/**
 * @async
 * @function updateBurritoMetadata
 * @description Updates the `metadata.json` of a Scripture Burrito project with a new ingredient
 *              and writes the updated metadata back to the file system.
 * @param project - The Project object (must be a Scripture Burrito project with `metadataJson` and `fileWriter`).
 * @param filePath - The relative path of the file for which the ingredient is being added/updated.
 * @param ingredientData - The ingredient data object to add to `metadata.json`.
 * @returns A Promise that resolves when `metadata.json` has been successfully updated and written.
 */
export async function updateBurritoMetadata(
    project: Project,
    filePath: string,
    ingredientData: any,
): Promise<void> {
    project.metadataJson.ingredients = project.metadataJson.ingredients || {};
    project.metadataJson.ingredients[filePath] = ingredientData;

    const updatedMetadataString = JSON.stringify(project.metadataJson, null, 2);
    await project.fileWriter.writeFile("metadata.json", updatedMetadataString);
    console.log(`Updated metadata.json with ingredient for ${filePath}`);
}
