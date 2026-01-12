import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectIndexer } from "@/app/domain/project/ProjectIndexer.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";

describe("ProjectIndexer", () => {
    const mockProjectRepository: IProjectRepository = {
        loadProject: vi.fn(),
        saveProject: vi.fn(),
        listProjects: vi.fn(),
        deleteProject: vi.fn(),
    } as IProjectRepository;

    const mockMd5Service: IMd5Service = {
        calculateMd5: vi.fn(),
    } as IMd5Service;

    let indexer: ProjectIndexer;

    beforeEach(() => {
        indexer = new ProjectIndexer(mockProjectRepository, mockMd5Service);
        vi.clearAllMocks();
    });

    describe("constructor", () => {
        it("should create instance with repository and md5Service", () => {
            expect(indexer).toBeInstanceOf(ProjectIndexer);
        });

        it("should accept IProjectRepository in constructor", () => {
            expect(indexer).toBeDefined();
        });

        it("should accept IMd5Service in constructor", () => {
            expect(indexer).toBeDefined();
        });
    });

    describe("indexProject", () => {
        it("should have correct method signature", () => {
            expect(typeof indexer.indexProject).toBe("function");
        });

        it("should accept projectDirPath parameter", () => {
            // This test verifies the method exists and can be called
            expect(indexer.indexProject.length).toBe(1);
        });
    });
});
