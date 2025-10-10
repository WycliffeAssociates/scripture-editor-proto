import { ProjectFile, ProjectMetadata } from "../data/project/project.ts";
import { IFileWriter } from "../domain/project/IFileWriter.ts";

export interface IProjectRepository {
    saveProject(project: Project): Promise<void>;
    loadProject(projectId: string): Promise<Project | null>;
    listProjects(): Promise<Project[]>;
}

export interface Project {
    id: string;
    name: string;
    files: ProjectFile[];
    path: string;
    metadata: ProjectMetadata;
    projectDir: FileSystemDirectoryHandle;
    fileWriter: IFileWriter;
    manifestYaml?: any; // To hold parsed manifest data for updates
    metadataJson?: any; // To hold parsed metadata data for updates
    addBook(bookCode: string, localizedBookTitle?: string, contents?: string): Promise<void>;
}
