import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { IProjectLoader } from "@/core/domain/project/IProjectLoader.ts";
import { ResourceContainerProjectLoader } from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import { ScriptureBurritoProjectLoader } from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileWriter } from "@/core/io/IFileWriter.ts";
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
    /**
     * @constructor
     * @description Creates an instance of ProjectLoader, initializing its internal loader implementations.
     */
    constructor(
        md5Service: IMd5Service,
        rcLoader: ResourceContainerProjectLoader = new ResourceContainerProjectLoader(),
        sbLoader: ScriptureBurritoProjectLoader = new ScriptureBurritoProjectLoader(
            md5Service,
        ),
    ) {
        this.resourceContainerLoader = rcLoader;
        this.scriptureBurritoLoader = sbLoader;
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
     * @returns A Promise that resolves to the loaded Project object, or null if no project can be loaded.
     */
    async loadProject(
        projectDir: IDirectoryHandle,
        fileWriter: IFileWriter,
    ): Promise<Project | null> {
        // const hasMetadataJson = await this.checkFileExists(projectDir, ScriptureBurritoProjectLoader.METADATA_FILENAME);
        // const hasManifestYaml = await this.checkFileExists(projectDir, ResourceContainerProjectLoader.MANIFEST_FILENAME);

        const hasMetadataJson = await this.checkFileExists(
            projectDir,
            "metadata.json",
        );
        const hasManifestYaml = await this.checkFileExists(
            projectDir,
            "manifest.yaml",
        );

        if (hasMetadataJson) {
            const project = await this.scriptureBurritoLoader.loadProject(
                projectDir,
                fileWriter,
            );
            if (project) return project;
        }

        if (hasManifestYaml) {
            const project = await this.resourceContainerLoader.loadProject(
                projectDir,
                fileWriter,
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
            const handle = await dir.getFileHandle(fileName);
            if (handle != null && handle !== undefined) return true;
        } catch (error) {
            console.error(`Error checking file existence: ${error}`);
            return false;
        }
        return false;
    }
}
