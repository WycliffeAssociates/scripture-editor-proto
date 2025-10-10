import { IProjectLoader } from "./IProjectLoader.ts";
import { Project } from "@/src-core/persistence/ProjectRepository.ts";
import { IFileWriter } from "./IFileWriter.ts";
import { canonicalBookMap } from "./bookMapping.ts";

export class ResourceContainerProjectLoader implements IProjectLoader {
    async loadProject(projectDir: FileSystemDirectoryHandle, fileWriter: IFileWriter): Promise<Project | null> {
        try {
            const manifestFileHandle = await projectDir.getFileHandle("manifest.yaml");
            const file = await manifestFileHandle.getFile();
            const contents = await file.text();
            // TODO: Implement actual YAML parsing
            const parsedManifest = {}; // Placeholder for parsed YAML
            console.log("Loading Resource Container manifest:", contents);

            const project: Project = {
                id: projectDir.name,
                name: projectDir.name,
                files: [],
                path: projectDir.path || "",
                metadata: { id: "", name: "", language: { id: "", name: "", direction: "ltr" } },
                projectDir,
                fileWriter,
                manifestYaml: parsedManifest,
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

                    // Update manifest.yaml
                    // This is a simplified mock. Real implementation would involve YAML parsing/serialization.
                    project.manifestYaml.projects = project.manifestYaml.projects || {};
                    project.manifestYaml.projects[project.id] = project.manifestYaml.projects[project.id] || {};
                    project.manifestYaml.projects[project.id].resources = project.manifestYaml.projects[project.id].resources || [];
                    project.manifestYaml.projects[project.id].resources.push({
                        identifier: book.code.toLowerCase(),
                        name: localizedBookTitle || book.code,
                        format: "usfm",
                        path: filePath,
                    });

                    // Write updated manifest back (mocked)
                    const updatedManifestString = JSON.stringify(project.manifestYaml, null, 2);
                    await fileWriter.writeFile("manifest.yaml", updatedManifestString);
                    console.log(`Added ${filename} to manifest.yaml`);
                },
            };
            return project;
        } catch (error) {
            console.debug(`No manifest.yaml found or error parsing: ${error}`);
            return null;
        }
    }
}
