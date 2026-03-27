import { stringify } from "yaml";
import { removeLeadingDirSlashes } from "@/core/data/utils/generic.ts";
import {
    generateUsfmFilename,
    getCanonicalBook,
} from "@/core/domain/project/bookMapping.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";
import {
    attachRemoteSyncCapability,
    classifyResourceKindFromResourceContainer,
    toReferenceDocumentReference,
} from "@/core/domain/project/referenceItemLoading.ts";
import {
    parseResourceContainer,
    type ResourceContainer,
    type ResourceContainerProject,
} from "@/core/domain/project/resourceContainer/resourceContainer.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import {
    createReferenceDocument,
    createReferenceDocumentId,
    type createReferenceDocumentReference,
} from "@/core/library/ReferenceDocuments.ts";
import {
    createPackedTranslationNotesBookFileName,
    createPackedTranslationNotesReadable,
    listPackedTranslationNotesBookCodes,
    readPackedTranslationNotesBook,
    readPackedTranslationNotesMetadata,
} from "@/core/library/stores/PackedTranslationNotesRepository.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import {
    type BookRef,
    type Project as PathProject,
    ScriptureWorkspaceType,
} from "@/core/persistence/ScriptureWorkspace.ts";

function toBookRef(args: {
    projectRootPath: string;
    path: string;
    title: string;
    identifier: string;
}): BookRef {
    const relativePath = removeLeadingDirSlashes(args.path);
    const fileName = relativePath.split("/").at(-1) ?? relativePath;
    return {
        bookCode: args.identifier.toUpperCase(),
        title: args.title,
        fileName,
        storageKey: fileName,
        path: `${args.projectRootPath}/${relativePath}`,
    };
}

/**
 * Loader for Resource Container-backed managed items.
 *
 * This sits in the load phase, not import. By the time it runs, the managed
 * path already exists on disk. Its job is to inspect the RC container metadata,
 * decide whether the item is scripture or a read-only resource such as TN/TW,
 * and reopen the appropriate compatibility/runtime shape.
 */
export class ResourceContainerProjectLoader {
    static readonly MANIFEST_FILENAME = "manifest.yaml";

    /**
     * Reopen a managed RC path as a loaded resource.
     *
     * This path is what the wider app uses for reference resources and for the
     * initial classification step before deciding whether promotion to an
     * editable scripture project is valid.
     */
    async openResource(args: {
        fs: FileSystem;
        projectRootPath: string;
        folderName: string;
        displayName: string;
    }): Promise<LoadedReferenceItem | null> {
        const manifestPath = `${args.projectRootPath}/${ResourceContainerProjectLoader.MANIFEST_FILENAME}`;
        if (!(await args.fs.exists(manifestPath))) return null;

        try {
            const contents = await args.fs.readText(manifestPath);
            const parsedManifest: Partial<ResourceContainer> =
                parseResourceContainer(contents);
            const projectId = parsedManifest.dublin_core?.identifier;
            const language = parsedManifest.dublin_core?.language;
            if (!projectId || !language) return null;

            const projectEntries = parsedManifest.projects ?? [];
            const documentEntries = projectEntries.map((project) => {
                const relativePath = removeLeadingDirSlashes(project.path);
                return {
                    project,
                    relativePath,
                    document: toReferenceDocumentReference({
                        relativePath,
                        name: project.title,
                    }),
                };
            });
            const metadataItemType = classifyResourceKindFromResourceContainer({
                identifier: parsedManifest.dublin_core?.identifier,
                title: parsedManifest.dublin_core?.title,
                subject: parsedManifest.dublin_core?.subject,
                format: parsedManifest.dublin_core?.format,
            });
            const itemType = metadataItemType;
            const isTranslationNotesResource = itemType === "translationNotes";
            const packedTranslationNoteBookCodes = isTranslationNotesResource
                ? await listPackedTranslationNotesBookCodes({
                      fs: args.fs,
                      resourcePath: args.projectRootPath,
                  })
                : [];
            const packedMetadata = isTranslationNotesResource
                ? await readPackedTranslationNotesMetadata({
                      fs: args.fs,
                      resourcePath: args.projectRootPath,
                  })
                : null;
            const remoteSource = packedMetadata?.remoteSource;

            console.debug(
                `[ResourceContainerProjectLoader] Classified ${projectId} as ${itemType}.`,
            );
            if (remoteSource) {
                console.debug(
                    `[ResourceContainerProjectLoader] Remote source metadata detected for ${projectId}; sync capability will be attached.`,
                );
            } else {
                console.debug(
                    `[ResourceContainerProjectLoader] No remote source metadata found for ${projectId}.`,
                );
            }
            if (packedTranslationNoteBookCodes.length > 0) {
                console.debug(
                    `[ResourceContainerProjectLoader] Packed TN book files detected for ${projectId}: ${packedTranslationNoteBookCodes.join(", ")}.`,
                );
            }

            const resource: Omit<
                LoadedReferenceItem,
                "listDocuments" | "readDocument"
            > = {
                folderName: args.folderName,
                displayName: args.displayName,
                managedPath: args.projectRootPath,
                projectId,
                projectType:
                    ScriptureWorkspaceType.RESOURCE_CONTAINER as ScriptureWorkspaceType,
                descriptor: {
                    id: projectId,
                    displayName: args.displayName,
                    type: itemType,
                    containerFormat: "resource-container" as const,
                    language: {
                        code: language.identifier,
                        name: language.title,
                        direction:
                            language.direction === LanguageDirection.RTL
                                ? "rtl"
                                : "ltr",
                    },
                    readOnly: itemType !== "usfmScripture",
                },
            };

            if (packedTranslationNoteBookCodes.length > 0) {
                const packedDocuments = packedTranslationNoteBookCodes.map(
                    (bookCode) =>
                        ({
                            id: createReferenceDocumentId(
                                createPackedTranslationNotesBookFileName(
                                    bookCode,
                                ),
                            ),
                            name: bookCode,
                            browsePath: [bookCode],
                        }) satisfies ReturnType<
                            typeof createReferenceDocumentReference
                        >,
                );

                const packedResource = {
                    ...resource,
                    listDocuments: async () =>
                        packedDocuments.map((document) => ({ ...document })),
                    readDocument: async (documentId: string) => {
                        const match = packedDocuments.find(
                            (document) => document.id === documentId,
                        );
                        if (!match) {
                            throw new Error(
                                `No resource document found for id ${documentId}`,
                            );
                        }

                        const book = await readPackedTranslationNotesBook(
                            {
                                fs: args.fs,
                                resourcePath: args.projectRootPath,
                            },
                            match.name,
                        );
                        if (!book) {
                            throw new Error(
                                `No packed translation notes book found for ${match.name}`,
                            );
                        }

                        return createReferenceDocument({
                            ...match,
                            contents: JSON.stringify(book, null, 2),
                        });
                    },
                    ...createPackedTranslationNotesReadable({
                        fs: args.fs,
                        resourcePath: args.projectRootPath,
                    }),
                };

                if (!remoteSource) return packedResource;
                return attachRemoteSyncCapability(packedResource, remoteSource);
            }

            const rawResource = {
                ...resource,
                listDocuments: async () =>
                    documentEntries.map(({ document }) => ({ ...document })),
                readDocument: async (documentId: string) => {
                    const match = documentEntries.find(
                        ({ document }) => document.id === documentId,
                    );
                    if (!match) {
                        throw new Error(
                            `No resource document found for id ${documentId}`,
                        );
                    }
                    const contents = await args.fs.readText(
                        `${args.projectRootPath}/${match.relativePath}`,
                    );
                    return createReferenceDocument({
                        ...match.document,
                        id: createReferenceDocumentId(match.relativePath),
                        contents,
                    });
                },
            };
            if (!remoteSource) return rawResource;

            return attachRemoteSyncCapability(rawResource, remoteSource);
        } catch (error) {
            console.debug(
                `[ResourceContainerProjectLoader] Failed to open resource from manifest.yaml: ${error}`,
            );
            return null;
        }
    }

    /**
     * Promote a managed RC path into the editable scripture project contract
     * when, and only when, the manifest/classification says it is scripture.
     *
     * This separation matters because translation notes and similar resources
     * may live in the same container format but should never be treated as the
     * editable scripture noun.
     */
    async openProject(args: {
        fs: FileSystem;
        projectRootPath: string;
        folderName: string;
        displayName: string;
    }): Promise<PathProject | null> {
        const resource = await this.openResource(args);
        if (!resource) return null;
        const manifestPath = `${args.projectRootPath}/${ResourceContainerProjectLoader.MANIFEST_FILENAME}`;

        try {
            const contents = await args.fs.readText(manifestPath);
            const parsedManifest: Partial<ResourceContainer> =
                parseResourceContainer(contents);
            if (
                resource.descriptor.type !== "usfmScripture" &&
                resource.descriptor.type !== "unknown"
            ) {
                console.debug(
                    `[ResourceContainerProjectLoader] Refusing to open non-scripture resource ${resource.descriptor.id} as a Project.`,
                );
                return null;
            }
            const projectId = parsedManifest.dublin_core?.identifier;
            const language = parsedManifest.dublin_core?.language;
            if (!projectId || !language) return null;

            const books = (parsedManifest.projects ?? []).map((project) =>
                toBookRef({
                    projectRootPath: args.projectRootPath,
                    path: project.path,
                    title: project.title,
                    identifier: project.identifier,
                }),
            );

            const findBookEntryByStorageKey = (storageKey: string) =>
                (parsedManifest.projects ?? []).find((project) => {
                    const relativePath = removeLeadingDirSlashes(project.path);
                    const fileName =
                        relativePath.split("/").at(-1) ?? relativePath;
                    return fileName === storageKey;
                });

            const project: PathProject = {
                folderName: args.folderName,
                displayName: args.displayName,
                projectPath: args.projectRootPath,
                projectId,
                projectType: ScriptureWorkspaceType.RESOURCE_CONTAINER,
                language: {
                    code: language.identifier,
                    name: language.title,
                    direction:
                        language.direction === LanguageDirection.RTL
                            ? "rtl"
                            : "ltr",
                },
                books,
                listBooks: async () => [...books],
                getBook: async (storageKey) => {
                    const bookEntry = findBookEntryByStorageKey(storageKey);
                    if (!bookEntry) {
                        throw new Error(
                            `No book found for storage key ${storageKey}`,
                        );
                    }
                    const relativePath = removeLeadingDirSlashes(
                        bookEntry.path,
                    );
                    const bookContents = await args.fs.readText(
                        `${args.projectRootPath}/${relativePath}`,
                    );
                    return {
                        ...toBookRef({
                            projectRootPath: args.projectRootPath,
                            path: bookEntry.path,
                            title: bookEntry.title,
                            identifier: bookEntry.identifier,
                        }),
                        contents: bookContents,
                    };
                },
                saveBook: async (storageKey, usfmText) => {
                    const bookEntry = findBookEntryByStorageKey(storageKey);
                    if (!bookEntry) {
                        throw new Error(
                            `No book found for storage key ${storageKey}`,
                        );
                    }
                    const relativePath = removeLeadingDirSlashes(
                        bookEntry.path,
                    );
                    await args.fs.writeText(
                        `${args.projectRootPath}/${relativePath}`,
                        usfmText,
                    );
                },
                addBook: async (bookCode, opts) => {
                    const book = getCanonicalBook(bookCode);

                    let finalRelativeFilePath = generateUsfmFilename(bookCode);
                    const currentProjects: ResourceContainerProject[] =
                        parsedManifest.projects || [];
                    const existingBookIndex = currentProjects.findIndex(
                        (res) => res.identifier === book.code.toLowerCase(),
                    );

                    if (existingBookIndex !== -1) {
                        const existingManifestEntry =
                            currentProjects[existingBookIndex];
                        if (existingManifestEntry.path) {
                            finalRelativeFilePath = removeLeadingDirSlashes(
                                existingManifestEntry.path,
                            );
                        }
                    }

                    await args.fs.writeText(
                        `${args.projectRootPath}/${finalRelativeFilePath}`,
                        opts?.contents ?? "",
                    );

                    if (existingBookIndex !== -1) {
                        currentProjects[existingBookIndex] = {
                            ...currentProjects[existingBookIndex],
                            title: opts?.localizedBookTitle || book.code,
                            path: finalRelativeFilePath,
                        };
                    } else {
                        currentProjects.push({
                            identifier: book.code.toLowerCase(),
                            title: opts?.localizedBookTitle || book.code,
                            path: finalRelativeFilePath,
                            sort: Number(book.num),
                            categories: [],
                        } as ResourceContainerProject);
                    }
                    parsedManifest.projects = currentProjects;

                    await args.fs.writeText(
                        manifestPath,
                        stringify(parsedManifest),
                    );

                    const nextBook = toBookRef({
                        projectRootPath: args.projectRootPath,
                        path: finalRelativeFilePath,
                        title: opts?.localizedBookTitle || book.code,
                        identifier: book.code,
                    });
                    const existingBookRefIndex = books.findIndex(
                        (candidate) => candidate.bookCode === nextBook.bookCode,
                    );
                    if (existingBookRefIndex >= 0) {
                        books[existingBookRefIndex] = nextBook;
                    } else {
                        books.push(nextBook);
                    }
                    return nextBook;
                },
                listVersions: async () => {
                    throw new Error(
                        "Version operations are not available on loader-opened projects.",
                    );
                },
                restoreVersion: async () => {
                    throw new Error(
                        "Version operations are not available on loader-opened projects.",
                    );
                },
                stageAndCommit: async () => {
                    throw new Error(
                        "Git operations are not available on loader-opened projects.",
                    );
                },
            };

            return project;
        } catch (error) {
            console.debug(
                `[ResourceContainerProjectLoader] Failed to open scripture project from manifest.yaml: ${error}`,
            );
            return null;
        }
    }
}
