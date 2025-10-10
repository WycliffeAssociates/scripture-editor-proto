import { Project } from "@/src-core/persistence/ProjectRepository.ts";

export interface IProjectLoader {
    loadProject(projectDir: FileSystemDirectoryHandle): Promise<Project | null>;
}
