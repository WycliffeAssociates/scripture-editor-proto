import { ProjectFile, ProjectMetadata } from "../data/project/project.ts";

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
}
