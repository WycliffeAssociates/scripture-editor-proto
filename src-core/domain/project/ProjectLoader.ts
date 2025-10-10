import { IProjectLoader } from "./IProjectLoader.ts";
import { ResourceContainerProjectLoader } from "./ResourceContainerProjectLoader.ts";
import { ScriptureBurritoProjectLoader } from "./ScriptureBurritoProjectLoader.ts";
import { Project } from "../../persistence/ProjectRepository.ts";
import { IFileWriter } from "./IFileWriter.ts";
import { IMd5Service } from "../md5/IMd5Service.ts";
// import { METADATA_JSON_FILE, MANIFEST_YAML_FILE } from "./projectConstants.ts";

export class ProjectLoader implements IProjectLoader {
    private resourceContainerLoader: ResourceContainerProjectLoader;
    private scriptureBurritoLoader: ScriptureBurritoProjectLoader;

    constructor() {
        this.resourceContainerLoader = new ResourceContainerProjectLoader();
        this.scriptureBurritoLoader = new ScriptureBurritoProjectLoader();
    }

    async loadProject(projectDir: FileSystemDirectoryHandle, fileWriter: IFileWriter, md5Service: IMd5Service): Promise<Project | null> {
        const hasMetadataJson = await this.checkFileExists(projectDir, ScriptureBurritoProjectLoader.METADATA_FILENAME);
        const hasManifestYaml = await this.checkFileExists(projectDir, ResourceContainerProjectLoader.MANIFEST_FILENAME);

        if (hasMetadataJson) {
            const project = await this.scriptureBurritoLoader.loadProject(projectDir, fileWriter, md5Service);
            if (project) return project;
        }

        if (hasManifestYaml) {
            const project = await this.resourceContainerLoader.loadProject(projectDir, fileWriter, md5Service);
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
