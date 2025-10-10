import { ProjectFile, ProjectMetadata } from "../data/project/project.ts";
import { IFileWriter } from "../domain/project/IFileWriter.ts";
import { IMd5Service } from "../domain/md5/IMd5Service.ts";

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
    md5Service: IMd5Service; // New: MD5 service for checksums
    addBook(bookCode: string, localizedBookTitle?: string, contents?: string): Promise<void>;
}
