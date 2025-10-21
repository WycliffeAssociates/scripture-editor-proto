import {IProjectLoader} from "@/core/domain/project/IProjectLoader.ts";
import {IFileWriter} from "@/core/io/IFileWriter.ts";
import {IMd5Service} from "@/core/domain/md5/IMd5Service.ts";
import {LanguageDirection} from "@/core/domain/project/project.ts";
import {canonicalBookMap} from "@/core/domain/project/bookMapping.ts";
import {Project} from "@/core/persistence/ProjectRepository.ts";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {parseResourceContainer, ResourceContainer} from "@/core/domain/project/resourceContainer/resourceContainer.ts";
import {IDirectoryProvider} from "@/core/persistence/DirectoryProvider.ts";


/**
 * @class ResourceContainerProjectLoader
 * @implements {IProjectLoader}
 * @description Implements IProjectLoader for Resource Container projects. It loads project data
 *              from a `manifest.yaml` file, extracts metadata, and provides functionality to add books
 *              according to the Resource Container specification.
 */
export class ResourceContainerProjectLoader implements IProjectLoader {
    static readonly MANIFEST_FILENAME = "manifest.yaml";
    private const directoryProvider: IDirectoryProvider;

    constructor(directoryProvider: IDirectoryProvider) {
        this.directoryProvider = directoryProvider;
    }


    /**
     * @method loadProject
     * @description Loads a Resource Container project from the specified directory handle.
     * @param projectDir - The IDirectoryHandle representing the project's root directory.
     * @param fileWriter - An IFileWriter instance for writing files within the project directory.
     * @returns A Promise that resolves to the loaded Project object, or null if the project cannot be loaded
     *          (e.g., manifest.yaml is missing or malformed).
     */
    async loadProject(projectDir: IDirectoryHandle, fileWriter: IFileWriter): Promise<Project | null> {
        try {
            const manifestFileHandle = await projectDir.getFileHandle(ResourceContainerProjectLoader.MANIFEST_FILENAME);
            if (!manifestFileHandle) return null;
            const file = await manifestFileHandle.getFile();
            const contents = await file.text();
            const parsedManifest: Partial<ResourceContainer> = parseResourceContainer(contents);
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
                name: parsedManifest.dublin_core?.title || projectId,
                files: [],
                metadata: {
                    id: projectId,
                    name: parsedManifest.dublin_core?.title || projectId,
                    language: {
                        id: language.identifier,
                        name: language.title,
                        direction: (language.direction === LanguageDirection.RTL)? LanguageDirection.RTL : LanguageDirection.LTR,
                    },
                },
                projectDir,
                fileWriter,
                /**
                 * @method addBook
                 * @description Adds a USFM book to the Resource Container project. If the book already exists
                 *              (either as a resource in the manifest or as a physical file), it will not be overwritten.
                 * @param bookCode - The three-letter book code (e.g., "MAT").
                 * @param localizedBookTitle - Optional. The localized title of the book. Defaults to the book code.
                 * @param contents - Optional. The USFM content of the book. Defaults to an empty string.
                 * @returns A Promise that resolves when the book is added and the manifest is updated.
                 */
                addBook: async (bookCode: string, localizedBookTitle?: string, contents: string = "") => {
                    const book = canonicalBookMap[bookCode.toUpperCase()];
                    if (!book) {
                        throw new Error(`Invalid book code: ${bookCode}`);
                    }

                    const existingProjects = parsedManifest.projects || [];
                    const bookIndex = existingProjects.findIndex((res: any) => res.identifier === book.code.toLowerCase());
                    const bookInManifest = existingProjects[bookIndex];
                    const bookExistsInManifest = bookIndex !== -1

                    let filename = `${book.num}-${book.code}.usfm`;
                    if (bookExistsInManifest) {
                        filename = bookInManifest.path
                        filename = filename.split("/").pop()!
                    }

                    try {
                        const directoryHandle: IDirectoryHandle | null = project.projectDir.asDirectoryHandle();
                        if (!directoryHandle) {
                            throw new Error(`Project directory ${project.projectDir.path} is not a directory.`);
                        }
                        const filePath = await directoryHandle.getFileHandle(filename, { create: false });
                        const file = await filePath.getAbsolutePath();
                        await fileWriter.writeFile(file, contents);
                        console.warn(`Book ${filename} already exists as a file. Not adding.`);
                        return;
                    } catch(error) {
                        console.error(error);
                    }


                    if (bookExistsInManifest) {
                        console.warn(`Book ${filename} already exists in manifest. Not adding.`);
                        await fileWriter.writeFile(filePath, contents);
                        return;
                    }

                    // Update manifest.yaml
                    const existingBookIndex = existingProjects.findIndex((res: any) => res.identifier === book.code.toLowerCase());

                    if (existingBookIndex == -1) {
                        existingProjects.push({
                            identifier: book.code.toLowerCase(),
                            title: localizedBookTitle || book.code,
                            path: filePath,
                            sort: 1,
                            versification: "ufw",
                            categories: []
                        });
                    }

                    // Write updated manifest back (mocked)
                    const updatedManifestString = JSON.stringify(project, null, 4);
                    await fileWriter.writeFile(ResourceContainerProjectLoader.MANIFEST_FILENAME, updatedManifestString);
                    console.log(`Added ${filename} to manifest.yaml`);
                },
            };
            return project;
        } catch (error) {
            console.debug(`No manifest.yaml found or error parsing: ${error}`);
            return null;
        }
    }
}