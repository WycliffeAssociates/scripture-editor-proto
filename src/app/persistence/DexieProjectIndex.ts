import type { EntityTable } from "dexie";
import Dexie from "dexie";
import { getCanonicalBook } from "@/core/domain/project/bookMapping.ts";
import type { LibraryItem } from "@/core/library/LibraryItem.ts";
import {
    isEditableItem,
    isRemoteSyncCapable,
    isUsfmScriptureItem,
} from "@/core/library/LibraryItem.ts";
import type { ContainerFormat } from "@/core/library/LibraryItemCapabilities.ts";
import type { IndexedLibraryItemType } from "@/core/library/LibraryItemType.ts";
import type {
    ProjectIndex,
    ResourceLibraryGroup,
    ResourceLibraryItem,
} from "@/core/library/ProjectIndex.ts";
import { isEditableScriptureProjectLibraryItem } from "@/core/library/ProjectIndex.ts";
import { basenameStoragePath } from "@/core/persistence/pathUtils.ts";
import {
    type Project,
    type ProjectListItem,
    ScriptureWorkspaceType,
} from "@/core/persistence/ScriptureWorkspace.ts";

type DbLanguage = {
    id?: number;
    identifier: string;
    title: string | null;
    direction: "ltr" | "rtl" | null;
    createdAt?: string;
    updatedAt?: string;
};

type DbProject = {
    id?: number;
    identifier: string | null;
    projectDir: string;
    title: string | null;
    languageId: number | null;
    version: string | null;
    itemType: IndexedLibraryItemType;
    containerFormat: ContainerFormat;
    isEditable: boolean;
    hasRemoteSync: boolean;
    libraryGroup: ResourceLibraryGroup;
    createdAt?: string;
    importedAt?: string;
    updatedAt?: string;
};

type DbFileRow = {
    id?: number;
    projectId: number;
    identifier: string | null;
    title: string | null;
    sortOrder: number | null;
    relativePath: string | null;
    pathOnDisk: string;
    fileExtension: string | null;
    createdAt?: string;
    updatedAt?: string;
};

type LanguageModification = {
    updatedAt?: string;
};

type ProjectModification = {
    updatedAt?: string;
};

type FileModification = {
    updatedAt?: string;
};

interface ScriptureEditorDB extends Dexie {
    languages: EntityTable<DbLanguage, "id">;
    projects: EntityTable<DbProject, "id">;
    files: EntityTable<DbFileRow, "pathOnDisk">;
}

function configureDb(db: typeof Dexie & ScriptureEditorDB) {
    db.version(1).stores({
        languages: "++id, identifier, title, direction, createdAt, updatedAt",
        projects:
            "++id, projectDir, identifier, title, languageId, version, createdAt, importedAt, updatedAt",
        files: "++id, projectId, identifier, title, sortOrder, relativePath, pathOnDisk, fileExtension, createdAt, updatedAt",
    });

    db.version(2).stores({
        languages: "++id, identifier, title, direction, createdAt, updatedAt",
        projects:
            "++id, projectDir, identifier, title, languageId, version, resourceKind, containerFormat, readOnly, libraryKind, libraryGroup, createdAt, importedAt, updatedAt",
        files: "++id, projectId, identifier, title, sortOrder, relativePath, pathOnDisk, fileExtension, createdAt, updatedAt",
    });

    db.version(3).stores({
        languages: "++id, identifier, title, direction, createdAt, updatedAt",
        projects:
            "++id, projectDir, identifier, title, languageId, version, itemType, containerFormat, isEditable, hasRemoteSync, libraryGroup, createdAt, importedAt, updatedAt",
        files: "++id, projectId, identifier, title, sortOrder, relativePath, pathOnDisk, fileExtension, createdAt, updatedAt",
    });

    db.languages.hook("creating", (_primKey, obj, _trans) => {
        obj.createdAt = new Date().toISOString();
        obj.updatedAt = new Date().toISOString();
    });

    db.languages.hook(
        "updating",
        (modifications: LanguageModification, _primKey, _obj, _trans) => {
            modifications.updatedAt = new Date().toISOString();
        },
    );

    db.projects.hook("creating", (_primKey, obj, _trans) => {
        obj.createdAt = new Date().toISOString();
        obj.importedAt = new Date().toISOString();
        obj.updatedAt = new Date().toISOString();
    });

    db.projects.hook(
        "updating",
        (modifications: ProjectModification, _primKey, _obj, _trans) => {
            modifications.updatedAt = new Date().toISOString();
        },
    );

    db.files.hook("creating", (_primKey, obj, _trans) => {
        obj.createdAt = new Date().toISOString();
        obj.updatedAt = new Date().toISOString();
    });

    db.files.hook(
        "updating",
        (modifications: FileModification, _primKey, _obj, _trans) => {
            modifications.updatedAt = new Date().toISOString();
        },
    );
}

function dbProjectToProjectListItem(args: {
    project: DbProject;
    language: DbLanguage | undefined;
}): ProjectListItem {
    const folderName =
        basenameStoragePath(args.project.projectDir) || args.project.projectDir;
    const displayName =
        args.project.title || folderName || args.project.projectDir;

    return {
        folderName,
        projectPath: args.project.projectDir,
        displayName,
        projectId: args.project.identifier || undefined,
        languageCode: args.language?.identifier || "",
        languageName: args.language?.title || "",
        projectType: toProjectType(args.project.containerFormat),
    };
}

function dbProjectToLibraryItem(args: {
    project: DbProject;
    language: DbLanguage | undefined;
}): ResourceLibraryItem {
    return {
        ...dbProjectToProjectListItem(args),
        type: args.project.itemType,
        containerFormat: args.project.containerFormat,
        isEditable: args.project.isEditable,
        hasRemoteSync: args.project.hasRemoteSync,
        libraryGroup: args.project.libraryGroup,
    };
}

function libraryItemToProjectListItem(
    item: ResourceLibraryItem,
): ProjectListItem {
    return {
        folderName: item.folderName,
        projectPath: item.projectPath,
        displayName: item.displayName,
        projectId: item.projectId,
        languageCode: item.languageCode,
        languageName: item.languageName,
        projectType: item.projectType,
    };
}

function toLibraryGroup(
    itemType: IndexedLibraryItemType,
): ResourceLibraryGroup {
    switch (itemType) {
        case "usfmScripture":
            return "scripture";
        case "translationNotes":
            return "translation-notes";
        case "translationWords":
            return "translation-words";
        default:
            return "other";
    }
}

function toProjectType(
    containerFormat: ContainerFormat,
): ScriptureWorkspaceType {
    switch (containerFormat) {
        case "scripture-burrito":
            return ScriptureWorkspaceType.SCRIPTURE_BURRITO;
        case "resource-container":
            return ScriptureWorkspaceType.RESOURCE_CONTAINER;
        default:
            return ScriptureWorkspaceType.UNKNOWN;
    }
}

function createIndexedProjectData(args: {
    projectDir: string;
    identifier: string | null;
    title: string;
    languageId: number | null;
    version: string | null;
    itemType: IndexedLibraryItemType;
    containerFormat: ContainerFormat;
    isEditable: boolean;
    hasRemoteSync: boolean;
}): Omit<DbProject, "id" | "createdAt" | "importedAt" | "updatedAt"> {
    return {
        projectDir: args.projectDir,
        identifier: args.identifier,
        title: args.title,
        languageId: args.languageId,
        version: args.version,
        itemType: args.itemType,
        containerFormat: args.containerFormat,
        isEditable: args.isEditable,
        hasRemoteSync: args.hasRemoteSync,
        libraryGroup: toLibraryGroup(args.itemType),
    };
}

function toIndexedLibraryItemType(
    item: LibraryItem | Project,
): IndexedLibraryItemType {
    if ("type" in item) {
        if (item.type === "translationNotes") return "translationNotes";
        if (item.type === "usfmScripture") return "usfmScripture";
    }

    return "usfmScripture";
}

function toContainerFormatForIndexedItem(
    item: LibraryItem | Project,
): ContainerFormat {
    if ("containerFormat" in item) {
        return item.containerFormat;
    }

    return item.projectType === ScriptureWorkspaceType.SCRIPTURE_BURRITO
        ? "scripture-burrito"
        : "resource-container";
}

export function buildProjectIndexDbName(namespace?: string | null): string {
    return namespace ? `zephyr-editor:${namespace}` : "zephyr-editor";
}

/**
 * Dexie-backed implementation of the library catalog index.
 *
 * The index stores lightweight facts derived from loaded typed nouns. It is a
 * searchable catalog over managed disk state, not a second copy of the managed
 * file tree and not the source of truth for item contents.
 */
export class DexieProjectIndex implements ProjectIndex {
    private readonly db: typeof Dexie & ScriptureEditorDB;

    constructor(databaseName = "zephyr-editor") {
        this.db = new Dexie(databaseName) as typeof Dexie & ScriptureEditorDB;
        configureDb(this.db);
    }

    async listProjects(): Promise<ProjectListItem[]> {
        const out: ProjectListItem[] = [];
        for (const item of await this.listLibraryItems()) {
            if (isEditableScriptureProjectLibraryItem(item)) {
                out.push(libraryItemToProjectListItem(item));
            }
        }
        return out;
    }

    async listLibraryItems(): Promise<ResourceLibraryItem[]> {
        const [projects, languages] = await Promise.all([
            this.db.projects.toArray(),
            this.db.languages.toArray(),
        ]);

        return projects.map((project) =>
            dbProjectToLibraryItem({
                project,
                language: languages.find(
                    (lang) => lang.id === project.languageId,
                ),
            }),
        );
    }

    async getProjectByPath(
        projectPath: string,
    ): Promise<ProjectListItem | null> {
        const project = await this.db.projects
            .where("projectDir")
            .equals(projectPath)
            .first();
        if (!project) return null;
        if (
            !isEditableScriptureProjectLibraryItem({
                type: project.itemType,
                isEditable: project.isEditable,
            })
        ) {
            return null;
        }

        const language =
            project.languageId == null
                ? undefined
                : await this.db.languages
                      .where("id")
                      .equals(project.languageId)
                      .first();

        return dbProjectToProjectListItem({ project, language });
    }

    async getLibraryItemByPath(
        projectPath: string,
    ): Promise<ResourceLibraryItem | null> {
        const project = await this.db.projects
            .where("projectDir")
            .equals(projectPath)
            .first();
        if (!project) return null;

        const language =
            project.languageId == null
                ? undefined
                : await this.db.languages
                      .where("id")
                      .equals(project.languageId)
                      .first();

        return dbProjectToLibraryItem({ project, language });
    }

    async indexItem(item: LibraryItem | Project): Promise<void> {
        const projectIdentifier =
            "type" in item ? item.id : (item.projectId ?? item.folderName);
        const projectName = item.displayName;
        const langIdentifier = item.language.code;
        const langTitle = item.language.name;
        const langDirection = item.language.direction;
        const itemType = toIndexedLibraryItemType(item);
        const containerFormat = toContainerFormatForIndexedItem(item);
        const isEditable = "type" in item ? isEditableItem(item) : true;
        const hasRemoteSync =
            "type" in item ? isRemoteSyncCapable(item) : false;
        const projectPath =
            "managedPath" in item ? item.managedPath : item.projectPath;
        const books =
            "type" in item
                ? isUsfmScriptureItem(item)
                    ? item.books
                    : []
                : item.books;

        await this.db.transaction(
            "rw",
            this.db.languages,
            this.db.projects,
            this.db.files,
            async () => {
                await this.db.languages.put({
                    identifier: langIdentifier,
                    title: langTitle,
                    direction: langDirection,
                });

                const languageRow = await this.db.languages
                    .where("identifier")
                    .equals(langIdentifier)
                    .first();
                const languageId = languageRow?.id ?? null;

                const existingProject = await this.db.projects
                    .where("projectDir")
                    .equals(projectPath)
                    .first();

                const projectData = createIndexedProjectData({
                    projectDir: projectPath,
                    identifier: projectIdentifier,
                    title: projectName,
                    languageId,
                    version: existingProject?.version ?? null,
                    itemType,
                    containerFormat,
                    isEditable,
                    hasRemoteSync,
                });

                if (existingProject) {
                    await this.db.projects.update(
                        existingProject.id,
                        projectData,
                    );
                } else {
                    await this.db.projects.add(projectData);
                }

                const projectRow = await this.db.projects
                    .where("projectDir")
                    .equals(projectPath)
                    .first();

                if (!projectRow?.id) {
                    throw new Error(
                        "[DexieProjectIndex] indexItem: project row missing id after upsert",
                    );
                }

                await this.db.files
                    .where("projectId")
                    .equals(projectRow.id)
                    .delete();

                for (const book of books) {
                    let sortOrder: number | null = null;
                    try {
                        sortOrder = Number(getCanonicalBook(book.bookCode).num);
                    } catch {
                        sortOrder = null;
                    }

                    const extensionStart = book.path.lastIndexOf(".");
                    const fileExtension =
                        extensionStart >= 0
                            ? book.path.substring(extensionStart)
                            : null;

                    await this.db.files.put({
                        projectId: projectRow.id,
                        identifier: book.bookCode ?? null,
                        title: book.title ?? null,
                        sortOrder,
                        relativePath: null,
                        pathOnDisk: book.path,
                        fileExtension,
                    });
                }
            },
        );
    }

    async renameDisplayName(
        projectPath: string,
        displayName: string,
    ): Promise<void> {
        const existing = await this.db.projects
            .where("projectDir")
            .equals(projectPath)
            .first();
        if (existing?.id == null) return;

        await this.db.projects.update(existing.id, {
            title: displayName,
        });
    }

    async deleteProject(projectPath: string): Promise<void> {
        await this.db.transaction(
            "rw",
            this.db.files,
            this.db.projects,
            async () => {
                const project = await this.db.projects
                    .where("projectDir")
                    .equals(projectPath)
                    .first();
                if (!project?.id) return;

                await this.db.files
                    .where("projectId")
                    .equals(project.id)
                    .delete();
                await this.db.projects.delete(project.id);
            },
        );
    }
}
