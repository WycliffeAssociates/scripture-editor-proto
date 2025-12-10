import type { ProjectFile } from "@/app/data/parsedProject.ts";
import { listProjectsByLanguage } from "@/app/db/api.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { IProjectLoader } from "@/core/domain/project/IProjectLoader.ts";
import { ProjectLoader } from "@/core/domain/project/ProjectLoader.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import { FileWriter } from "@/core/io/DefaultFileWriter.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileWriter } from "@/core/io/IFileWriter.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import type {
    IProjectRepository,
    ListedProject,
    Project,
} from "@/core/persistence/ProjectRepository.ts";

export class ProjectRepository implements IProjectRepository {
    private projectLoader: IProjectLoader;
    public md5Service: IMd5Service;

    constructor(
        private directoryProvider: IDirectoryProvider,
        md5Service: IMd5Service,
    ) {
        this.projectLoader = new ProjectLoader(md5Service);
        this.md5Service = md5Service;
    }

    private createFileWriter(projectDir: IDirectoryHandle): IFileWriter {
        return new FileWriter(this.directoryProvider, projectDir);
    }

    async saveProject(project: Project): Promise<void> {
        const projectsDir = await this.directoryProvider.projectsDirectory;
        const projectDir = await projectsDir.getDirectoryHandle(project.id, {
            create: true,
        });
        const projectFile = await projectDir.getFileHandle("project.json", {
            create: true,
        });
        const writer = await projectFile.createWritable();
        await writer.write(JSON.stringify(project, null, 2));
        await writer.close();
    }

    async loadProject(projectId: string): Promise<Project | null> {
        try {
            const projectsRootDir =
                await this.directoryProvider.projectsDirectory;
            const projectDir = await projectsRootDir.getDirectoryHandle(
                projectId,
                {
                    create: true,
                },
            );

            const fileWriter = this.createFileWriter(projectDir);
            const project = await this.projectLoader.loadProject(
                projectDir,
                fileWriter,
            );

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
    /**
     * List projects using DB rows as the authoritative index.
     *
     * For each DB row we attempt to resolve the corresponding directory on disk.
     * If the directory is present we return a lightweight Project object that
     * contains `projectDir`, `fileWriter`, `metadata` and methods that delegate
     * to the fuller loader when required.
     */
    async listProjects(): Promise<ListedProject[]> {
        // Fetch canonical project rows from DB
        const dbProjects = await listProjectsByLanguage();

        // map to a worskapce Project:
        const projects: ListedProject[] = dbProjects.map((p) => {
            const candidate = {
                id: p.projectIdentifier,
                name: p.projectTitle,
                files: [] as ProjectFile[],
                projectDirectoryPath: p.projectDir,
                metadata: {
                    id: p.projectIdentifier,
                    name: p.projectTitle,
                    language: {
                        id: p.languageIdentifier,
                        name: p.languageTitle,
                        direction: p.languageDirection as LanguageDirection,
                    },
                },
            };
            return candidate;
        });
        return projects;
    }

    async deleteProject(
        projectPath: string,
        options: { recursive: boolean } = { recursive: false },
    ): Promise<void> {
        await this.directoryProvider.removeDirectory(projectPath, options);
    }
}
