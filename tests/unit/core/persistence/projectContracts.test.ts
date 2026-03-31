import { describe, expect, expectTypeOf, it } from "vitest";
import type { FileSystem, FileSystemEntry } from "@/core/persistence/FileSystem.ts";
import type {
    BookContents,
    BookRef,
    Project,
    ProjectLanguage,
    ProjectListItem,
} from "@/core/persistence/ScriptureWorkspace.ts";
import type { ImportSource } from "@/core/domain/project/import/ProjectImporter.ts";
import type {
    OpenEditableProjectResult,
    ProjectsService,
} from "@/core/persistence/WorkspaceService.ts";
import type { ImportProjectOptions } from "@/core/library/ImportService.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

describe("path-based persistence contracts", () => {
    it("pins the path-based storage surface", () => {
        const roots: StorageRoots = {
            appDataRoot: "/appData",
            projectsRoot: "/userData/projects",
            tempRoot: "/appData/temp",
            cacheRoot: "/appData/cache",
            logsRoot: "/appData/logs",
            databaseRoot: "/appData/database",
        };

        const entries: FileSystemEntry[] = [
            {
                name: "63-1JN.usfm",
                path: "/userData/projects/reg/63-1JN.usfm",
                kind: "file",
            },
        ];

        const fileSystem: FileSystem = {
            readText: async () => "",
            readBytes: async () => new Uint8Array(),
            writeText: async () => {},
            writeBytes: async () => {},
            exists: async () => true,
            list: async () => entries,
            mkdir: async () => {},
            remove: async () => {},
            move: async () => {},
            createTempFile: async (prefix, suffix) =>
                `/appData/temp/${prefix}${suffix ?? ""}`,
        };

        expect(roots.projectsRoot).toBe("/userData/projects");
        expect(entries[0]).toEqual({
            name: "63-1JN.usfm",
            path: "/userData/projects/reg/63-1JN.usfm",
            kind: "file",
        });
        expectTypeOf(fileSystem.list).returns.toEqualTypeOf<
            Promise<FileSystemEntry[]>
        >();
    });

    it("pins Project book contracts around storage keys rather than paths", async () => {
        const language: ProjectLanguage = {
            code: "adh",
            name: "Adhola",
            direction: "ltr",
        };
        const bookRef: BookRef = {
            bookCode: "1JN",
            title: "1 John",
            fileName: "63-1JN.usfm",
            storageKey: "63-1JN.usfm",
            path: "/userData/projects/reg/63-1JN.usfm",
        };

        const project: Project = {
            folderName: "reg",
            displayName: "Adhola Bible",
            projectPath: "/userData/projects/reg",
            projectId: "reg",
            projectType: "resource-container",
            language,
            books: [bookRef],
            listBooks: async () => [bookRef],
            getBook: async (storageKey) => ({
                ...bookRef,
                storageKey,
                contents: "\\id 1JN\n\\c 1\n\\v 1 In the beginning",
            }),
            saveBook: async () => {},
            addBook: async (bookCode) => ({
                bookCode,
                title: bookCode,
                fileName: `00-${bookCode}.usfm`,
                storageKey: `00-${bookCode}.usfm`,
                path: `/userData/projects/reg/00-${bookCode}.usfm`,
            }),
            listVersions: async () => [],
            restoreVersion: async () => {},
            stageAndCommit: async () => ({ hash: "abc123" }),
        };

        const book = await project.getBook(bookRef.storageKey);

        expect(book.storageKey).toBe(bookRef.fileName);
        expect(book.contents).toContain("\\id 1JN");
        expect(project.projectPath).toBe("/userData/projects/reg");
        expect(project.language.direction).toBe("ltr");
        expectTypeOf(book).toEqualTypeOf<BookContents>();
        expectTypeOf<Project["saveBook"]>().parameters.toEqualTypeOf<
            [storageKey: string, usfmText: string]
        >();
    });

    it("pins ProjectsService as the collection lifecycle boundary", async () => {
        const listed: ProjectListItem = {
            folderName: "reg",
            projectPath: "/userData/projects/reg",
            displayName: "Adhola Bible",
            projectId: "reg",
            languageCode: "adh",
            languageName: "Adhola",
            projectType: "resource-container",
        };

        const project: Project = {
            folderName: "reg",
            displayName: "Adhola Bible",
            projectPath: "/userData/projects/reg",
            projectId: "reg",
            projectType: "resource-container",
            language: {
                code: "adh",
                name: "Adhola",
                direction: "ltr",
            },
            books: [],
            listBooks: async () => [],
            getBook: async () => {
                throw new Error("not implemented in contract test");
            },
            saveBook: async () => {},
            addBook: async () => {
                throw new Error("not implemented in contract test");
            },
            listVersions: async () => [],
            restoreVersion: async () => {},
            stageAndCommit: async () => ({ hash: "abc123" }),
        };

        const projectsService: ProjectsService = {
            listProjects: async () => [listed],
            listReferenceResources: async () => [],
            openEditableProject: async () =>
                ({
                    project,
                }) satisfies OpenEditableProjectResult,
            openProject: async () => project,
            openProjectReadOnly: async () => project,
            openResource: async () => null,
            importProject: async () => ({
                project: listed,
                gitReady: true,
                isEditableProject: true,
            }),
            listWritableRemoteRepos: async () => ({
                repos: [],
                nextPage: null,
            }),
            listOwnedRemoteRepos: async () => ({
                repos: [],
                nextPage: null,
            }),
            createRemoteForProject: async () => {
                throw new Error("not implemented in contract test");
            },
            attachProjectToRemote: async () => {
                throw new Error("not implemented in contract test");
            },
            cloneWritableRemoteProject: async () => {
                throw new Error("not implemented in contract test");
            },
            deleteProject: async () => {},
            renameDisplayName: async () => {},
            reconcileIndex: async () => {},
        };

        await expect(
            projectsService.importProject({
                type: "fromZipFile",
                filePath: "/appData/temp/import.zip",
            }),
        ).resolves.toEqual({
            project: listed,
            gitReady: true,
            isEditableProject: true,
        });
        await expect(projectsService.openProject(listed.folderName)).resolves.toBe(
            project,
        );
        await expect(
            projectsService.openEditableProject(listed.folderName),
        ).resolves.toEqual({ project });
        await expect(
            projectsService.openProjectReadOnly(listed.folderName),
        ).resolves.toBe(project);
        expectTypeOf<ProjectsService["importProject"]>().parameters.toEqualTypeOf<
            [source: ImportSource, options?: ImportProjectOptions]
        >();
        expectTypeOf<ProjectsService["deleteProject"]>().parameters.toEqualTypeOf<
            [projectPath: string]
        >();
    });
});
