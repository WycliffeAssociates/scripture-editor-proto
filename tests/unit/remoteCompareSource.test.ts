import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRemoteLatestCompareSource } from "@/app/domain/project/compare/remoteCompareSource.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY } from "@/core/persistence/gitRemoteRelationship.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

vi.mock("@/app/domain/project/versionSnapshotAdapter.ts", () => ({
    snapshotToScriptureBookStates: vi.fn(async () => [
        { bookCode: "GEN", chapters: [] },
    ]),
}));

function makeProject(): Project {
    return {
        folderName: "bho-bible",
        displayName: "Bho Bible",
        projectPath: "/userData/projects/bho-bible",
        projectId: "bho-bible",
        projectType: "scripture-burrito",
        language: {
            code: "bho",
            name: "Bhojpuri",
            direction: "ltr",
        },
        books: [],
        listBooks: async () => [],
        getBook: async () => {
            throw new Error("not needed");
        },
        saveBook: async () => {},
        addBook: async () => {
            throw new Error("not needed");
        },
        listVersions: async () => [],
        restoreVersion: async () => {},
        stageAndCommit: async () => ({ hash: "head" }),
    };
}

const usfmOnionService = {
    supportsPathIo: false,
} as IUsfmOnionService;

describe("buildRemoteLatestCompareSource", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("fetches remote latest, loads the remote snapshot, and maps it into compare metadata", async () => {
        const gitProvider = {
            fetchRemoteHeads: vi.fn().mockResolvedValue({
                localHead: "local-head",
                remoteHead: "remote-head",
                mergeBase: "base-head",
                relationship: {
                    kind: GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
                    localHead: "local-head",
                    remoteHead: "remote-head",
                    mergeBase: "base-head",
                },
            }),
            readProjectSnapshotAtCommit: vi
                .fn()
                .mockResolvedValue(new Map([["01-GEN.usfm", "\\id GEN"]])),
        };

        const result = await buildRemoteLatestCompareSource({
            loadedProject: makeProject(),
            remoteInfo: {
                schemaVersion: 1,
                projectPath: "/userData/projects/bho-bible",
                hostBaseUrl: "https://gitea.example.org",
                repoId: "1",
                repoOwner: "alice",
                repoName: "bho-bible",
                repoUrl: "https://gitea.example.org/alice/bho-bible",
                trackedBranch: "master",
            },
            auth: {
                username: "alice",
                token: "secret-token",
            },
            gitProvider,
            editorMode: "regular",
            usfmOnionService,
        });

        expect(gitProvider.fetchRemoteHeads).toHaveBeenCalledWith({
            projectPath: "/userData/projects/bho-bible",
            remoteName: "origin",
            branch: "master",
            auth: {
                username: "alice",
                token: "secret-token",
            },
        });
        expect(gitProvider.readProjectSnapshotAtCommit).toHaveBeenCalledWith(
            "/userData/projects/bho-bible",
            "remote-head",
        );
        expect(result).toEqual({
            parsedFiles: [{ bookCode: "GEN", chapters: [] }],
            metadataSummary: {
                projectId: "bho-bible",
                languageId: "bho",
                languageDirection: "ltr",
            },
            remoteHead: "remote-head",
        });
    });

    it("throws when the fetch completes without a remote head", async () => {
        const gitProvider = {
            fetchRemoteHeads: vi.fn().mockResolvedValue({
                localHead: "local-head",
                remoteHead: null,
                mergeBase: null,
                relationship: {
                    kind: "untrackedRemote",
                    localHead: "local-head",
                    remoteHead: null,
                    mergeBase: null,
                },
            }),
            readProjectSnapshotAtCommit: vi.fn(),
        };

        await expect(
            buildRemoteLatestCompareSource({
                loadedProject: makeProject(),
                remoteInfo: {
                    schemaVersion: 1,
                    projectPath: "/userData/projects/bho-bible",
                    hostBaseUrl: "https://gitea.example.org",
                    repoId: "1",
                    repoOwner: "alice",
                    repoName: "bho-bible",
                    repoUrl: "https://gitea.example.org/alice/bho-bible",
                    trackedBranch: "master",
                },
                auth: {
                    username: "alice",
                    token: "secret-token",
                },
                gitProvider,
                editorMode: "regular",
                usfmOnionService,
            }),
        ).rejects.toThrow(/remote head/u);
        expect(gitProvider.readProjectSnapshotAtCommit).not.toHaveBeenCalled();
    });
});
