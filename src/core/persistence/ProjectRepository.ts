import {IMd5Service} from "@/core/domain/md5/IMd5Service.ts";
import {ProjectFile} from "@/app/data/parsedProject.ts";
import {ProjectMetadata} from "@/core/domain/project/project.ts";
import {IFileWriter} from "@/core/io/IFileWriter.ts";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";


/**
 * @interface IProjectRepository
 * @description Defines the contract for managing persistence operations of Project objects.
 *              This includes saving, loading, and listing projects.
 */
export interface IProjectRepository {
    /**
     * @method saveProject
     * @description Saves the given Project object. The implementation handles the underlying storage mechanism.
     * @param project - The Project object to save.
     * @returns A Promise that resolves when the project has been successfully saved.
     */
    saveProject(project: Project): Promise<void>;
    /**
     * @method loadProject
     * @description Loads a Project object by its unique identifier.
     * @param projectId - The unique identifier of the project to load.
     * @param md5Service - An IMd5Service instance for calculating MD5 checksums (used by the ProjectLoader within).
     * @returns A Promise that resolves to the loaded Project object, or null if no project is found with the given ID.
     */
    loadProject(projectId: string, md5Service: IMd5Service): Promise<Project | null>;
    /**
     * @method listProjects
     * @description Retrieves a list of all available projects.
     * @returns A Promise that resolves to an array of Project objects.
     */
    listProjects(): Promise<Project[]>;
}

/**
 * @interface Project
 * @description Represents a project with its metadata, files, directory handle, file writer, and MD5 service.
 *              It also includes a method to add books to the project.
 */
export interface Project {
    id: string;
    name: string;
    files: ProjectFile[];
    metadata: ProjectMetadata;
    projectDir: IDirectoryHandle;
    fileWriter: IFileWriter;
    /**
     * @method addBook
     * @description Adds a USFM file (book) to the project. This method is intelligent about project type
     *              and updates the relevant metadata (e.g., manifest.yaml or metadata.json) accordingly.
     *              It will not overwrite existing books.
     * @param bookCode - The three-letter book code (e.g., "MAT", "MRK").
     * @param localizedBookTitle - Optional. A localized title for the book. Defaults to the book code.
     * @param contents - Optional. The USFM content of the book. Defaults to an empty string to initialize an empty file.
     * @returns A Promise that resolves when the book has been successfully added to the project and its metadata.
     */
    addBook(bookCode: string, localizedBookTitle?: string, contents?: string): Promise<void>;
    /**
     * @method getBook
     * @description Retrieves the content of a specific book from the project.
     * @param bookCode - The three-letter book code (e.g., "MAT", "MRK").
     * @returns A Promise that resolves to the content of the book as a string, or null if the book is not found.
     */
    getBook(bookCode: string): Promise<string | null>;
}