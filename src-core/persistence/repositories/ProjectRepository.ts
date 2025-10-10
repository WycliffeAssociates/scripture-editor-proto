
import { IProjectRepository, Project } from "../ProjectRepository.ts";
import { IDirectoryProvider } from "../DirectoryProvider.ts";
import { IFileWriter } from "../../domain/project/IFileWriter.ts";
import { FileWriter } from "../../../src/persistence/FileWriter.ts";

export class ProjectRepository implements IProjectRepository {
    constructor(private directoryProvider: IDirectoryProvider) {}

    private createFileWriter(projectDir: FileSystemDirectoryHandle): IFileWriter {
        return new FileWriter(this.directoryProvider); // Now using the concrete FileWriter
    }

    async saveProject(project: Project): Promise<void> {
        const userDataDir = await this.directoryProvider.getUserDataDirectory();
        const projectsDir = await userDataDir.getDirectoryHandle("projects", { create: true });
        const projectDir = await projectsDir.getDirectoryHandle(project.id, { create: true });
        const projectFile = await projectDir.getFileHandle("project.json", { create: true });
        const writer = await projectFile.createWritable();
        await writer.write(JSON.stringify(project, null, 2));
        await writer.close();
    }

    async loadProject(projectId: string): Promise<Project | null> {
        try {
            const userDataDir = await this.directoryProvider.getUserDataDirectory();
            const projectsDir = await userDataDir.getDirectoryHandle("projects");
            const projectDir = await projectsDir.getDirectoryHandle(projectId);
            const projectFile = await projectDir.getFileHandle("project.json");
            const file = await projectFile.getFile();
            const contents = await file.text();
            return JSON.parse(contents);
        } catch (error) {
            console.error(`Error loading project ${projectId}:`, error);
            return null;
        }
    }

    async listProjects(): Promise<Project[]> {
        const projects: Project[] = [];
        try {
            const userDataDir = await this.directoryProvider.getUserDataDirectory();
            const projectsDir = await userDataDir.getDirectoryHandle("projects");
            for await (const [name, handle] of projectsDir.entries()) {
                if (handle.kind === "directory") {
                    try {
                        const directoryHandle = handle as FileSystemDirectoryHandle; // Explicit cast after type guard
                        const projectFile = await directoryHandle.getFileHandle("project.json");
                        const file = await projectFile.getFile();
                        const contents = await file.text();
                        projects.push(JSON.parse(contents));
                    } catch (error) {
                        console.warn(`Could not load project from directory ${name}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error("Error listing projects:", error);
        }
        return projects;
    }
}
