import { IProjectLoader } from "./IProjectLoader.ts";
import { Project } from "@/src-core/persistence/ProjectRepository.ts";

export class ScriptureBurritoProjectLoader implements IProjectLoader {
    async loadProject(projectDir: FileSystemDirectoryHandle): Promise<Project | null> {
        try {
            const metadataFileHandle = await projectDir.getFileHandle("metadata.json");
            const file = await metadataFileHandle.getFile();
            const contents = await file.text();
            const metadata = JSON.parse(contents);

            // Placeholder for project data from metadata.json
            const project: Project = {
                id: metadata.id || projectDir.name,
                name: metadata.name || projectDir.name,
                files: [], // Populate based on metadata
                path: projectDir.path || "", // Or derive from metadata
                metadata: { id: metadata.id, name: metadata.name, language: { id: metadata.languages?.default?.tag, name: metadata.languages?.default?.tag, direction: "ltr" } }, // Populate based on metadata
            };
            return project;
        } catch (error) {
            console.debug(`No metadata.json found or error parsing: ${error}`);
            return null;
        }
    }
}
