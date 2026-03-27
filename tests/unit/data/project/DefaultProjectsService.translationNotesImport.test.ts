import { beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultLibraryService } from "@/app/library/DefaultLibraryService.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { ProjectImporter } from "@/core/domain/project/import/ProjectImporter.ts";
import { isRemoteSyncCapable } from "@/core/library/ReferenceItemSupport.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { ProjectIndex } from "@/core/library/ProjectIndex.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { seedEnTnCondensedFixture } from "@tests/helpers/mockData/enTnCondensed.ts";
import { loadTranslationNotesForAnchor } from "@/app/reference/translationNotes.ts";

const mockMd5Service: IMd5Service = {
    calculateMd5: vi.fn(async (text: string) => `mock-md5-${text}`),
};

const mockGitProvider: GitProvider = {
    ensureRepo: vi.fn(async () => {}),
    getBranchInfo: vi.fn(async () => ({
        current: "main",
        hasMaster: false,
        defaultBranch: "main",
        detached: false,
    })),
    checkoutPreferredBranch: vi.fn(async () => {}),
    listHistory: vi.fn(async () => []),
    readProjectSnapshotAtCommit: vi.fn(async () => new Map()),
    restoreTrackedFilesFromCommit: vi.fn(async () => {}),
    commitAll: vi.fn(async () => ({ hash: "abc123" })),
    isRepoHealthy: vi.fn(async () => true),
};

const roots: StorageRoots = {
    projectsRoot: "/userData/projects",
    tempRoot: "/appData/temp",
    cacheRoot: "/appData/cache",
    logsRoot: "/appData/logs",
    databaseRoot: "/appData/database",
};

function makeProjectIndex(): ProjectIndex {
    return {
        listProjects: vi.fn(async () => []),
        listLibraryItems: vi.fn(async () => []),
        getProjectByPath: vi.fn(async () => null),
        getLibraryItemByPath: vi.fn(async () => null),
        indexItem: vi.fn(async () => {}),
        renameDisplayName: vi.fn(async () => {}),
        deleteProject: vi.fn(async () => {}),
    };
}

describe("DefaultProjectsService translation notes import", () => {
    let fileSystem: InMemoryFileSystem;
    let projectIndex: ProjectIndex;
    let projectsService: DefaultLibraryService;
    const importedPath = "/userData/projects/en_tn_condensed";

    beforeEach(() => {
        fileSystem = new InMemoryFileSystem({
            [importedPath + "/manifest.yaml"]: "projects: []",
        });
        projectIndex = makeProjectIndex();
        projectsService = new DefaultLibraryService(
            fileSystem,
            roots,
            projectIndex,
            mockMd5Service,
            mockGitProvider,
        );
    });

    it("packs imported TN resources into per-book JSON before indexing", async () => {
        await seedEnTnCondensedFixture(fileSystem, importedPath);

        const result = await projectsService.importProject({
            type: "fromPreparedDir",
            directoryPath: importedPath,
        });

        expect(projectIndex.indexItem).toHaveBeenCalledWith(
            expect.objectContaining({
                managedPath: importedPath,
                type: "translationNotes",
            }),
        );
        expect(result.isEditableProject).toBe(false);
        expect(result.project.projectPath).toBe(importedPath);
        expect(await fileSystem.exists(`${importedPath}/luk.json`)).toBe(true);
        expect(await fileSystem.exists(`${importedPath}/luk/22/71.md`)).toBe(
            false,
        );

        const resource = await projectsService.openItem(importedPath);
        if (!resource || resource.type !== "translationNotes") {
            throw new Error("Expected packed translation notes resource to reopen");
        }
        await expect(resource.listBookCodes()).resolves.toEqual(
            expect.arrayContaining(["COL", "DAN", "LUK"]),
        );

        const notes = await loadTranslationNotesForAnchor({
            resource,
            anchor: {
                bookCode: "LUK",
                chapterNumber: 22,
            },
        });

        expect(notes).toHaveLength(1);
        expect(notes[0].rawMarkdown).toContain(
            "Why do we still need a witness?",
        );
        expect(notes[0].rawMarkdown).toContain(
            '"We have no further need for witnesses!"',
        );
    });

    it("reimports and repacks remote TN resources in place when applyUpdates is called", async () => {
        vi.spyOn(ProjectImporter.prototype, "import").mockImplementationOnce(
            async (source) => {
                expect(source).toEqual({
                    type: "fromGitRepo",
                    url: "https://example.com/en_tn_condensed.git",
                });
                await seedEnTnCondensedFixture(fileSystem, importedPath);
                return importedPath;
            },
        );
        await projectsService.importProject({
            type: "fromGitRepo",
            url: "https://example.com/en_tn_condensed.git",
        });

        const updatedImportPath = "/userData/projects/en_tn_condensed_update";
        vi.spyOn(ProjectImporter.prototype, "import").mockImplementationOnce(
            async (source) => {
                expect(source).toEqual({
                    type: "fromGitRepo",
                    url: "https://example.com/en_tn_condensed.git",
                });
                await seedEnTnCondensedFixture(fileSystem, updatedImportPath);
                await fileSystem.writeText(
                    `${updatedImportPath}/luk/22/71.md`,
                    '# Updated witness note\n\n"Updated remote content"\n',
                );
                return updatedImportPath;
            },
        );

        const resource = await projectsService.openResource(importedPath);
        if (!resource || !isRemoteSyncCapable(resource)) {
            throw new Error("Expected remote-sync-capable TN resource.");
        }

        await resource.applyUpdates();

        expect(await fileSystem.exists(`${importedPath}/luk.json`)).toBe(true);
        expect(await fileSystem.exists(`${updatedImportPath}`)).toBe(false);
        expect(
            [...fileSystem.directories].some((path) =>
                path.includes(".update-backup-"),
            ),
        ).toBe(false);

        const reloaded = await projectsService.openItem(importedPath);
        if (!reloaded || reloaded.type !== "translationNotes") {
            throw new Error("Expected updated TN resource to reload.");
        }

        const notes = await loadTranslationNotesForAnchor({
            resource: reloaded,
            anchor: {
                bookCode: "LUK",
                chapterNumber: 22,
            },
        });

        expect(notes[0].rawMarkdown).toContain("Updated witness note");
        expect(notes[0].rawMarkdown).toContain(
            '"Updated remote content"',
        );
        expect(projectIndex.indexItem).toHaveBeenCalledWith(
            expect.objectContaining({
                managedPath: importedPath,
            }),
        );
    });

    it("restores the previous packed TN resource if replace-in-place update fails", async () => {
        vi.spyOn(ProjectImporter.prototype, "import").mockImplementationOnce(
            async () => {
                await seedEnTnCondensedFixture(fileSystem, importedPath);
                return importedPath;
            },
        );
        await projectsService.importProject({
            type: "fromGitRepo",
            url: "https://example.com/en_tn_condensed.git",
        });

        const originalMove = fileSystem.move.bind(fileSystem);
        const moveSpy = vi
            .spyOn(fileSystem, "move")
            .mockImplementation(async (from, to) => {
                if (
                    from === "/userData/projects/en_tn_condensed_update" &&
                    to === importedPath
                ) {
                    throw new Error("replace failed");
                }
                return originalMove(from, to);
            });

        vi.spyOn(ProjectImporter.prototype, "import").mockImplementationOnce(
            async () => {
                const updatedImportPath = "/userData/projects/en_tn_condensed_update";
                await seedEnTnCondensedFixture(fileSystem, updatedImportPath);
                await fileSystem.writeText(
                    `${updatedImportPath}/luk/22/71.md`,
                    '# Updated witness note\n\n"Updated remote content"\n',
                );
                return updatedImportPath;
            },
        );

        const resource = await projectsService.openResource(importedPath);
        if (!resource || !isRemoteSyncCapable(resource)) {
            throw new Error("Expected remote-sync-capable TN resource.");
        }

        await expect(resource.applyUpdates()).rejects.toThrow("replace failed");

        const restored = await projectsService.openItem(importedPath);
        if (!restored || restored.type !== "translationNotes") {
            throw new Error("Expected original TN resource to be restored.");
        }

        const notes = await loadTranslationNotesForAnchor({
            resource: restored,
            anchor: {
                bookCode: "LUK",
                chapterNumber: 22,
            },
        });

        expect(notes[0].rawMarkdown).toContain(
            "Why do we still need a witness?",
        );
        expect(notes[0].rawMarkdown).toContain(
            '"We have no further need for witnesses!"',
        );
        moveSpy.mockRestore();
    });
});
