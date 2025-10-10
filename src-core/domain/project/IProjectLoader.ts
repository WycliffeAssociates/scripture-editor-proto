import { Project } from "@/src-core/persistence/ProjectRepository.ts";
import { IFileWriter } from "./IFileWriter.ts";
import { IMd5Service } from "../md5/IMd5Service.ts";

/**
 * @interface IProjectLoader
 * @description Defines the contract for loading a project from a given directory.
 *              Implementations will vary based on the project's metadata format (e.g., Scripture Burrito, Resource Container).
 */
export interface IProjectLoader {
    /**
     * @method loadProject
     * @description Loads a project from the specified directory handle.
     * @param projectDir - The FileSystemDirectoryHandle representing the project's root directory.
     * @param fileWriter - An IFileWriter instance for writing files within the project directory.
     * @param md5Service - An IMd5Service instance for calculating MD5 checksums.
     * @returns A Promise that resolves to the loaded Project object, or null if the project cannot be loaded.
     */
    loadProject(projectDir: FileSystemDirectoryHandle, fileWriter: IFileWriter, md5Service: IMd5Service): Promise<Project | null>;
}
