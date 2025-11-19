import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileWriter } from "@/core/io/IFileWriter.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

/**
 * @interface IProjectLoader
 * @description Defines the contract for loading a project from a given directory.
 *              Implementations will vary based on the project's metadata format (e.g., Scripture Burrito, Resource Container).
 */
export interface IProjectLoader {
  /**
   * @method loadProject
   * @description Loads a project from the specified directory handle.
   * @param projectDir - The IPathHandle representing the project's root directory.
   * @param fileWriter - An IFileWriter instance for writing files within the project directory.
   * @returns A Promise that resolves to the loaded Project object, or null if the project cannot be loaded.
   */
  loadProject(
    projectDir: IDirectoryHandle,
    fileWriter: IFileWriter,
  ): Promise<Project | null>;
}
