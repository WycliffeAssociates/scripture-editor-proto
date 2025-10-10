import { IProjectLoader } from "./IProjectLoader.ts";
import { Project } from "@/src-core/persistence/ProjectRepository.ts";
import { IFileWriter } from "./IFileWriter.ts";
import { generateUsfmFilename, createBurritoIngredient, updateBurritoMetadata } from "./scriptureBurritoHelpers.ts";
import { IMd5Service } from "../md5/IMd5Service.ts";

export class ScriptureBurritoProjectLoader implements IProjectLoader {
    async loadProject(projectDir: FileSystemDirectoryHandle, fileWriter: IFileWriter, md5Service: IMd5Service): Promise<Project | null> {
        try {
            const metadataFileHandle = await projectDir.getFileHandle("metadata.json");
            const file = await metadataFileHandle.getFile();
            const contents = await file.text();
            const metadata = JSON.parse(contents);

            const project: Project = {
                id: metadata.id || projectDir.name,
                name: metadata.name || projectDir.name,
                files: [],
                path: projectDir.path || "",
                metadata: { id: metadata.id, name: metadata.name, language: { id: metadata.languages?.default?.tag, name: metadata.languages?.default?.tag, direction: "ltr" } },
                projectDir,
                fileWriter,
                metadataJson: metadata,
                md5Service,
                addBook: async (bookCode: string, localizedBookTitle?: string, contents: string = "") => {
                    const filename = generateUsfmFilename(bookCode);
                    const filePath = filename; // Path relative to projectDir

                    try {
                        await projectDir.getFileHandle(filePath, { create: false });
                        console.warn(`Book ${filename} already exists. Not adding.`);
                        return; // Book already exists, do not overwrite
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
