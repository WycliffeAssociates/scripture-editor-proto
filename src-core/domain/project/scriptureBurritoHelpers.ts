import { IFileWriter } from "./IFileWriter.ts";
import { canonicalBookMap } from "./bookMapping.ts";
import type { Project } from "@/src-core/persistence/ProjectRepository.ts";
import type { IMd5Service } from "../md5/IMd5Service.ts";

export function generateUsfmFilename(bookCode: string): string {
    const book = canonicalBookMap[bookCode.toUpperCase()];
    if (!book) {
        throw new Error(`Invalid book code: ${bookCode}`);
    }
    return `${book.num}-${book.code}.usfm`;
}

export function createBurritoIngredient(filePath: string, contents: string, md5Service: IMd5Service, localizedBookTitle?: string, bookCode?: string) {
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

export async function updateBurritoMetadata(project: Project, filePath: string, ingredientData: any): Promise<void> {
    project.metadataJson.ingredients = project.metadataJson.ingredients || {};
    project.metadataJson.ingredients[filePath] = ingredientData;

    const updatedMetadataString = JSON.stringify(project.metadataJson, null, 2);
    await project.fileWriter.writeFile("metadata.json", updatedMetadataString);
    console.log(`Updated metadata.json with ingredient for ${filePath}`);
}
