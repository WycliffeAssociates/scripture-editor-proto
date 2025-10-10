import { IProjectLoader } from "./IProjectLoader.ts";
import { Project } from "@/src-core/persistence/ProjectRepository.ts";

export class ResourceContainerProjectLoader implements IProjectLoader {
    async loadProject(projectDir: FileSystemDirectoryHandle): Promise<Project | null> {
        try {
            const manifestFileHandle = await projectDir.getFileHandle("manifest.yaml");
            const file = await manifestFileHandle.getFile();
            const contents = await file.text();
            // TODO: Implement actual YAML parsing
            console.log("Loading Resource Container manifest:", contents);

            // Placeholder for project data from manifest.yaml
            const project: Project = {
                id: projectDir.name,
                name: projectDir.name,
                files: [], // Populate based on manifest
                path: projectDir.path || "", // Or derive from manifest
                metadata: { id: "", name: "", language: { id: "", name: "", direction: "ltr" } }, // Populate based on manifest
            };
            return project;
        } catch (error) {
            console.debug(`No manifest.yaml found or error parsing: ${error}`);
            return null;
        }
    }
}
