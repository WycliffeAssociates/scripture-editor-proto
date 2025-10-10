import { IProjectLoader } from "./IProjectLoader.ts";
import { Project } from "@/src-core/persistence/ProjectRepository.ts";
import { IFileWriter } from "./IFileWriter.ts";
import { canonicalBookMap } from "./bookMapping.ts";

export class ScriptureBurritoProjectLoader implements IProjectLoader {
    async loadProject(projectDir: FileSystemDirectoryHandle, fileWriter: IFileWriter): Promise<Project | null> {
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
                addBook: async (bookCode: string, localizedBookTitle?: string, contents: string = "") => {
                    const book = canonicalBookMap[bookCode.toUpperCase()];
                    if (!book) {
                        throw new Error(`Invalid book code: ${bookCode}`);
                    }
                    const filename = `${book.num}-${book.code}.usfm`;
                    const filePath = filename; // Path relative to projectDir

                    try {
                        await projectDir.getFileHandle(filePath, { create: false });
                        console.warn(`Book ${filename} already exists. Not adding.`);
                        return; // Book already exists, do not overwrite
                    } catch {
                        // File does not exist, proceed to create
                    }

                    await fileWriter.writeFile(filePath, contents);

                    // Update metadata.json (Scripture Burrito ingredient)
                    // This is a simplified mock. Real implementation would be more complex.
                    project.metadataJson.ingredients = project.metadataJson.ingredients || {};
                    project.metadataJson.ingredients[filePath] = {
                        checksum: {
                            md5: "", // Placeholder
                        },
                        size: contents.length,
                        mimeType: "text/usfm",
                        title: localizedBookTitle || book.code,
                    };

                    // Write updated metadata back (mocked)
                    const updatedMetadataString = JSON.stringify(project.metadataJson, null, 2);
                    await fileWriter.writeFile("metadata.json", updatedMetadataString);
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
