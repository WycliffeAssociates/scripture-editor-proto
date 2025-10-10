import { IProjectLoader } from "./IProjectLoader.ts";
import { ResourceContainerProjectLoader } from "./ResourceContainerProjectLoader.ts";
import { ScriptureBurritoProjectLoader } from "./ScriptureBurritoProjectLoader.ts";
import { Project } from "@/src-core/persistence/ProjectRepository.ts";
import { IFileWriter } from "./IFileWriter.ts";

export class ProjectLoader implements IProjectLoader {
    private resourceContainerLoader: ResourceContainerProjectLoader;
    private scriptureBurritoLoader: ScriptureBurritoProjectLoader;

    constructor() {
        this.resourceContainerLoader = new ResourceContainerProjectLoader();
        this.scriptureBurritoLoader = new ScriptureBurritoProjectLoader();
    }

    async loadProject(projectDir: FileSystemDirectoryHandle, fileWriter: IFileWriter): Promise<Project | null> {
        const hasMetadataJson = await this.checkFileExists(projectDir, "metadata.json");
        const hasManifestYaml = await this.checkFileExists(projectDir, "manifest.yaml");

        if (hasMetadataJson) {
            const project = await this.scriptureBurritoLoader.loadProject(projectDir, fileWriter);
            if (project) return project;
        }

        if (hasManifestYaml) {
            const project = await this.resourceContainerLoader.loadProject(projectDir, fileWriter);
            if (project) return project;
        }

        return null;
    }

    private async checkFileExists(dir: FileSystemDirectoryHandle, fileName: string): Promise<boolean> {
        try {
            await dir.getFileHandle(fileName);
            return true;
        } catch (error) {
            return false;
        }
    }
}
