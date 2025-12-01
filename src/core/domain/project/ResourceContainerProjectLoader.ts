import { stringify } from "yaml";
import { removeLeadingDirSlashes } from "@/core/data/utils/generic.ts";
import { canonicalBookMap } from "@/core/domain/project/bookMapping.ts";
import type { IProjectLoader } from "@/core/domain/project/IProjectLoader.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";
import {
  parseResourceContainer,
  type ResourceContainer,
  type ResourceContainerProject,
} from "@/core/domain/project/resourceContainer/resourceContainer.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileWriter } from "@/core/io/IFileWriter.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

/**
 * @class ResourceContainerProjectLoader
 * @implements {IProjectLoader}
 * @description Implements IProjectLoader for Resource Container projects. It loads project data
 *              from a `manifest.yaml` file, extracts metadata, and provides functionality to add books
 *              according to the Resource Container specification.
 */
export class ResourceContainerProjectLoader implements IProjectLoader {
  static readonly MANIFEST_FILENAME = "manifest.yaml";

  // not used atm
  // constructor() {}

  /**
   * @method loadProject
   * @description Loads a Resource Container project from the specified directory handle.
   * @param projectDir - The IDirectoryHandle representing the project's root directory.
   * @param fileWriter - An IFileWriter instance for writing files within the project directory.
   * @returns A Promise that resolves to the loaded Project object, or null if the project cannot be loaded
   *          (e.g., manifest.yaml is missing or malformed).
   */
  async loadProject(
    projectDir: IDirectoryHandle,
    fileWriter: IFileWriter,
  ): Promise<Project | null> {
    try {
      const manifestFileHandle = await projectDir.getFileHandle(
        ResourceContainerProjectLoader.MANIFEST_FILENAME,
      );
      if (!manifestFileHandle) return null;
      const file = await manifestFileHandle.getFile();
      const contents = await file.text();
      const parsedManifest: Partial<ResourceContainer> =
        parseResourceContainer(contents);
      console.log("Loading Resource Container manifest:", contents);

      const projectId = parsedManifest.dublin_core?.identifier;
      const language = parsedManifest.dublin_core?.language;
      if (!projectId) {
        console.log("No project id found for project:", projectId);
        return null;
      }

      if (!language) {
        console.log("No language found for project:", projectId);
        return null;
      }

      const project: Project = {
        id: projectId,
        name: `${parsedManifest.dublin_core?.title}` || projectId,
        files:
          parsedManifest.projects?.map((project) => ({
            path: `${projectDir.path}/${removeLeadingDirSlashes(project.path)}`,
            title: project.title,
            bookCode: project.identifier.toUpperCase(),
            nextBookId: null,
            prevBookId: null,
            sort: project.sort ?? 0,
          })) || [],
        metadata: {
          id: projectId,
          name: parsedManifest.dublin_core?.title || projectId,
          language: {
            id: language.identifier,
            name: language.title,
            direction:
              language.direction === LanguageDirection.RTL
                ? LanguageDirection.RTL
                : LanguageDirection.LTR,
          },
        },
        projectDir,
        fileWriter,
        /**
         * @method addBook
         * @description Adds a USFM book to the Resource Container project. If the book already exists
         *              (either as a resource in the manifest or as a physical file), it will be overwritten.
         *              If it does not exist, it will be added to the manifest.
         * @param bookCode - The three-letter book code (e.g., "MAT").
         * @param localizedBookTitle - Optional. The localized title of the book. Defaults to the book code.
         * @param contents - Optional. The USFM content of the book. Defaults to an empty string.
         * @returns A Promise that resolves when the book is added and the manifest is updated.
         */
        addBook: async ({
          bookCode,
          localizedBookTitle,
          contents = "",
        }: {
          bookCode: string;
          localizedBookTitle?: string;
          contents?: string;
        }) => {
          const book = canonicalBookMap[bookCode.toUpperCase()];
          if (!book) {
            throw new Error(`Invalid book code: ${bookCode}`);
          }

          let finalRelativeFilePath = `${book.num}-${book.code}.usfm`;
          const currentProjects: ResourceContainerProject[] =
            parsedManifest.projects || [];
          const existingBookIndex = currentProjects.findIndex(
            (res) => res.identifier === book.code.toLowerCase(),
          );

          if (existingBookIndex !== -1) {
            const existingManifestEntry = currentProjects[existingBookIndex];
            // Defer to the manifest's path if it exists
            if (existingManifestEntry.path) {
              finalRelativeFilePath = removeLeadingDirSlashes(
                existingManifestEntry.path,
              );
            }
          }

          const directoryHandle: IDirectoryHandle | null =
            project.projectDir.asDirectoryHandle();

          if (!directoryHandle) {
            throw new Error(
              `Project directory ${project.projectDir.path} is not a directory.`,
            );
          }

          // Get or create the file handle for the book using the final determined relative path
          // const bookFileHandle = await directoryHandle.getFileHandle(
          //     finalRelativeFilePath,
          //     { create: true },
          // );
          // const writer = await bookFileHandle.createWriter();
          // await writer.write(contents);
          // await writer.close();
          await fileWriter.writeFile(finalRelativeFilePath, contents);
          console.log(`File ${finalRelativeFilePath} written/overwritten.`);

          // Update manifest.yaml with the final relative file path
          if (existingBookIndex !== -1) {
            // Update existing book entry
            currentProjects[existingBookIndex] = {
              ...currentProjects[existingBookIndex],
              title: localizedBookTitle || book.code,
              path: finalRelativeFilePath, // Ensure manifest path is updated
            };
            console.log(`Updated existing book ${book.code} in manifest.`);
          } else {
            // Add new book entry
            currentProjects.push({
              identifier: book.code.toLowerCase(),
              title: localizedBookTitle || book.code,
              path: finalRelativeFilePath, // Use the final determined relative path
              sort: Number(book.num),
              versification: "ufw", // Default for now
              categories: [],
            } as ResourceContainerProject);
            console.log(`Added new book ${book.code} to manifest.`);
          }
          parsedManifest.projects = currentProjects;

          // Write updated manifest back
          const updatedManifestString = stringify(parsedManifest);
          //   const manifestFileHandle = await projectDir.getFileHandle(
          //     ResourceContainerProjectLoader.MANIFEST_FILENAME,
          //     {create: true}
          //   );
          //   const manifestWriter = await manifestFileHandle.createWriter();
          await fileWriter.writeFile(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
            updatedManifestString,
          );

          //   await manifestWriter.write(updatedManifestString);
          //   await manifestWriter.close();
          console.log(
            `Manifest ${ResourceContainerProjectLoader.MANIFEST_FILENAME} updated.`,
          );
        },
        /**
         * @method getBook
         * @description Retrieves the content of a specific book from the Resource Container project.
         * @param bookCode - The three-letter book code (e.g., "MAT").
         * @returns A Promise that resolves to the content of the book as a string, or null if the book is not found.
         */
        getBook: async (bookCode: string): Promise<string | null> => {
          const book = canonicalBookMap[bookCode.toUpperCase()];
          if (!book) {
            console.warn(
              `Book with code ${bookCode} not found in canonical map.`,
            );
            return null;
          }

          const currentProjects: ResourceContainerProject[] =
            parsedManifest.projects || [];
          const bookInManifest = currentProjects.find(
            (res) => res.identifier === book.code.toLowerCase(),
          );

          let bookPath: string;
          if (bookInManifest?.path) {
            bookPath = bookInManifest.path;
          } else {
            bookPath = `${book.num}-${book.code}.usfm`; // Default path if not in manifest or path is missing
          }

          const directoryHandle: IDirectoryHandle | null =
            project.projectDir.asDirectoryHandle();
          if (!directoryHandle) {
            console.error(
              `Project directory ${project.projectDir.path} is not a directory.`,
            );
            return null;
          }

          try {
            const fileHandle = await directoryHandle.getFileHandle(bookPath);
            const file = await fileHandle.getFile();
            return await file.text();
          } catch (error) {
            console.debug(
              `Could not read book file for ${bookCode} at path ${bookPath}: ${error}`,
            );
            return null;
          }
        },
      };
      return project;
    } catch (error) {
      console.debug(`No manifest.yaml found or error parsing: ${error}`);
      return null;
    }
  }
}
