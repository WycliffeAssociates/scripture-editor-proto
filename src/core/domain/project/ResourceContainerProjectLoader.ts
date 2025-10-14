import {IProjectLoader} from "@/core/domain/project/IProjectLoader.ts";
import {IFileWriter} from "@/core/persistence/IFileWriter.ts";
import {IMd5Service} from "@/core/domain/md5/IMd5Service.ts";
import {LanguageDirection} from "@/core/domain/project/project.ts";
import {canonicalBookMap} from "@/core/domain/project/bookMapping.ts";
import {Project} from "@/core/persistence/ProjectRepository.ts";


/**
 * @class ResourceContainerProjectLoader
 * @implements {IProjectLoader}
 * @description Implements IProjectLoader for Resource Container projects. It loads project data
 *              from a `manifest.yaml` file, extracts metadata, and provides functionality to add books
 *              according to the Resource Container specification.
 */
export class ResourceContainerProjectLoader implements IProjectLoader {
    static readonly MANIFEST_FILENAME = "manifest.yaml";

    /**
     * @method loadProject
     * @description Loads a Resource Container project from the specified directory handle.
     * @param projectDir - The FileSystemDirectoryHandle representing the project's root directory.
     * @param fileWriter - An IFileWriter instance for writing files within the project directory.
     * @param md5Service - An IMd5Service instance (though not directly used in RC loading, it's part of the Project interface).
     * @returns A Promise that resolves to the loaded Project object, or null if the project cannot be loaded
     *          (e.g., manifest.yaml is missing or malformed).
     */
    async loadProject(projectDir: FileSystemDirectoryHandle, fileWriter: IFileWriter, md5Service: IMd5Service): Promise<Project | null> {
        try {
            const manifestFileHandle = await projectDir.getFileHandle(ResourceContainerProjectLoader.MANIFEST_FILENAME);
            const file = await manifestFileHandle.getFile();
            const contents = await file.text();
            // TODO: Implement actual YAML parsing
            const parsedManifest: any = { projects: {} }; // Initialize with a structure that anticipates 'projects'
            console.log("Loading Resource Container manifest:", contents);

            const projectId = projectDir.name; // Resource Container usually derives project ID from directory name
            const projectMetadata = parsedManifest.projects?.[projectId]?.projectMeta || {};
            const defaultLanguageTag = projectMetadata.target_language?.tag || "und";
            const defaultLanguageName = projectMetadata.target_language?.name || "Undefined";
            const defaultLanguageDirection = projectMetadata.target_language?.direction === "rtl" ? LanguageDirection.RTL : LanguageDirection.LTR;

            const project: Project = {
                id: projectId,
                name: projectMetadata.name || projectId,
                files: [],
                // path: projectDir.path || "", // Removed as FileSystemDirectoryHandle does not have a .path property
                metadata: {
                    id: projectId,
                    name: projectMetadata.name || projectId,
                    language: {
                        id: defaultLanguageTag,
                        name: defaultLanguageName,
                        direction: defaultLanguageDirection,
                    },
                },
                projectDir,
                fileWriter,
                manifestYaml: parsedManifest,
                md5Service,
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
                    const filename = `${book.num}-${book.code}.usfm`;
                    const filePath = filename; // Path relative to projectDir

                    const existingResources = project.manifestYaml.projects?.[project.id]?.resources || [];
                    const bookExistsInManifest = existingResources.some((res: any) => res.identifier === book.code.toLowerCase());

                    if (bookExistsInManifest) {
                        console.warn(`Book ${filename} already exists in manifest. Not adding.`);
                        return;
                    }

                    try {
                        await projectDir.getFileHandle(filePath, { create: false });
                        console.warn(`Book ${filename} already exists as a file. Not adding.`);
                        return;
                    } catch {
                        // File does not exist, proceed to create
                    }

                    await fileWriter.writeFile(filePath, contents);

                    // Update manifest.yaml
                    // This is a simplified mock. Real implementation would involve YAML parsing/serialization.
                    project.manifestYaml.projects = project.manifestYaml.projects || {};
                    project.manifestYaml.projects[project.id] = project.manifestYaml.projects[project.id] || {};
                    project.manifestYaml.projects[project.id].resources = project.manifestYaml.projects[project.id].resources || [];
                    project.manifestYaml.projects[project.id].resources.push({
                        identifier: book.code.toLowerCase(),
                        name: localizedBookTitle || book.code,
                        format: "usfm",
                        path: filePath,
                    });

                    // Write updated manifest back (mocked)
                    const updatedManifestString = JSON.stringify(project.manifestYaml, null, 2);
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