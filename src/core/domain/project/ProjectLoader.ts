import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { IProjectLoader } from "@/core/domain/project/IProjectLoader.ts";
import { ResourceContainerProjectLoader } from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import { ScriptureBurritoProjectLoader } from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import type { IFileWriter } from "@/core/persistence/IFileWriter.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

/**
 * @class ProjectLoader
 * @implements {IProjectLoader}
 * @description Orchestrates the loading of a project by attempting to detect its type (Scripture Burrito or Resource Container)
 *              and delegating to the appropriate loader. It prioritizes Scripture Burrito if both metadata files are present.
 */
export class ProjectLoader implements IProjectLoader {
    private resourceContainerLoader: ResourceContainerProjectLoader;
    private scriptureBurritoLoader: ScriptureBurritoProjectLoader;

    /**
     * @constructor
     * @description Creates an instance of ProjectLoader, initializing its internal loader implementations.
     */
    constructor() {
        this.resourceContainerLoader = new ResourceContainerProjectLoader();
        this.scriptureBurritoLoader = new ScriptureBurritoProjectLoader();
    }

    /**
     * @method loadProject
     * @description Attempts to load a project from the given directory. It checks for the presence of
     *              `metadata.json` (for Scripture Burrito) and `manifest.yaml` (for Resource Container).
     *              If `metadata.json` is found, it attempts to load as a Scripture Burrito project. If that fails
     *              or only `manifest.yaml` is found, it attempts to load as a Resource Container project.
     *              If neither is found, or both fail, it returns null.
     * @param projectDir - The FileSystemDirectoryHandle representing the project's root directory.
     * @param fileWriter - An IFileWriter instance for writing files within the project directory.
     * @param md5Service - An IMd5Service instance for calculating MD5 checksums.
     * @returns A Promise that resolves to the loaded Project object, or null if no project can be loaded.
     */
    async loadProject(
        projectDir: FileSystemDirectoryHandle,
        fileWriter: IFileWriter,
        md5Service: IMd5Service,
    ): Promise<Project | null> {
        const hasMetadataJson = await this.checkFileExists(
            projectDir,
            ScriptureBurritoProjectLoader.METADATA_FILENAME,
        );
        const hasManifestYaml = await this.checkFileExists(
            projectDir,
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
        );

        if (hasMetadataJson) {
            const project = await this.scriptureBurritoLoader.loadProject(
                projectDir,
                fileWriter,
                md5Service,
            );
            if (project) return project;
        }

        if (hasManifestYaml) {
            const project = await this.resourceContainerLoader.loadProject(
                projectDir,
                fileWriter,
                md5Service,
            );
            if (project) return project;
        }

        return null;
    }

    /**
     * @private
     * @method checkFileExists
     * @description Helper method to check if a file exists within a given directory handle.
     * @param dir - The FileSystemDirectoryHandle to search within.
     * @param fileName - The name of the file to check for.
     * @returns A Promise that resolves to true if the file exists, false otherwise.
     */
    private async checkFileExists(
        dir: FileSystemDirectoryHandle,
        fileName: string,
    ): Promise<boolean> {
        try {
            await dir.getFileHandle(fileName);
            return true;
        } catch (error) {
            return false;
        }
    }
}
