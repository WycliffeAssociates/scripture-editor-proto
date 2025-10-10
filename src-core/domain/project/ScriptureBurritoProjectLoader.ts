import { IProjectLoader } from "./IProjectLoader.ts";
import { Project } from "../../persistence/ProjectRepository.ts";
import { IFileWriter } from "./IFileWriter.ts";
import { generateUsfmFilename, createBurritoIngredient, updateBurritoMetadata } from "./scriptureBurritoHelpers.ts";
import { IMd5Service } from "../md5/IMd5Service.ts";
import { LanguageDirection } from "../../data/project/project.ts";

export class ScriptureBurritoProjectLoader implements IProjectLoader {
    static readonly METADATA_FILENAME = "metadata.json";

    async loadProject(projectDir: FileSystemDirectoryHandle, fileWriter: IFileWriter, md5Service: IMd5Service): Promise<Project | null> {
        try {
            const metadataFileHandle = await projectDir.getFileHandle(ScriptureBurritoProjectLoader.METADATA_FILENAME);
            const file = await metadataFileHandle.getFile();
            const contents = await file.text();
            const metadata = JSON.parse(contents);

            const defaultLanguageTag = metadata.languages?.default?.tag || "und";
            const defaultLanguageName = metadata.languages?.[defaultLanguageTag]?.name?.en || "Undefined";
            const defaultLanguageDirection = metadata.languages?.[defaultLanguageTag]?.direction === "rtl" ? LanguageDirection.RTL : LanguageDirection.LTR;

            const project: Project = {
                id: metadata.id || projectDir.name,
                name: metadata.name || metadata.identification?.name?.en || projectDir.name,
                files: [],
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
                addBook: async (bookCode: string, localizedBookTitle?: string, contents: string = "") => {
                    const filename = generateUsfmFilename(bookCode);
                    const filePath = filename; // Path relative to projectDir

                    if (project.metadataJson.ingredients && project.metadataJson.ingredients[filePath]) {
                        console.warn(`Book ${filename} already exists as an ingredient. Not adding.`);
                        return; 
                    }

                    try {
                        await projectDir.getFileHandle(filePath, { create: false });
                        console.warn(`Book ${filename} already exists as a file. Not adding.`);
                        return; 
                    } catch {
                        // File does not exist, proceed to create
                    }

                    await fileWriter.writeFile(filePath, contents);

                    const ingredientData = await createBurritoIngredient(filePath, contents, md5Service, localizedBookTitle, bookCode);
                    await updateBurritoMetadata(project, filePath, ingredientData);
                    console.log(`Added ${filename} as ingredient to metadata.json`);
                },
            };
            return project;
        } catch (error) {
            console.debug(`No metadata.json found or error parsing: ${error}`);
            return null;
        }
    }
}
