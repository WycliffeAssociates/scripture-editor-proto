import {IProjectRepository, Project} from "@/core/persistence/ProjectRepository.ts";
import {IDirectoryProvider} from "@/core/persistence/DirectoryProvider.ts";
import {IMd5Service} from "@/core/domain/md5/IMd5Service.ts";
import {IFileWriter} from "@/core/io/IFileWriter.ts";
import {FileWriter} from "@/core/io/DefaultFileWriter.ts";
import {ProjectLoader} from "@/core/domain/project/ProjectLoader.ts";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {IProjectLoader} from "@/core/domain/project/IProjectLoader.ts";


export class ProjectRepository implements IProjectRepository {

    private projectLoader: IProjectLoader

    constructor(
        private directoryProvider: IDirectoryProvider,
        md5Service: IMd5Service
    ) {
       this.projectLoader = new ProjectLoader(md5Service)
    }

    private createFileWriter(projectDir: FileSystemDirectoryHandle): IFileWriter {
        return new FileWriter(this.directoryProvider, projectDir);
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
            const projectsRootDir = await userDataDir.getDirectoryHandle("projects", { create: true });
            const projectDir = await projectsRootDir.getDirectoryHandle(projectId, { create: true });

            const fileWriter = this.createFileWriter(projectDir);
            const project = await this.projectLoader.loadProject(projectDir, fileWriter);

            if (project) {
                // The Project object now has its fileWriter and projectDir correctly set
                return project;
            }
            return null;
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
            debugger
            for await (const [name, handle] of projectsDir.entries()) {
                if (handle.kind === "directory") {
                    try {
                        const directoryHandle = handle as IDirectoryHandle;
                        const project = await this.projectLoader.loadProject(directoryHandle, new FileWriter(this.directoryProvider, directoryHandle))
                        if (project) {
                            projects.push(project);
                        } else {
                            throw new Error()
                        }
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
