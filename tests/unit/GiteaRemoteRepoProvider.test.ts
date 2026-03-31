import { describe, expect, it, vi } from "vitest";
import { GiteaRemoteRepoProvider } from "@/core/persistence/GiteaRemoteRepoProvider.ts";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            ...init?.headers,
        },
        ...init,
    });
}

describe("GiteaRemoteRepoProvider", () => {
    it("lists only writable repos and preserves next-page detection from the server payload", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            jsonResponse(
                {
                    data: [
                        {
                            id: 1,
                            name: "writable-one",
                            full_name: "alice/writable-one",
                            html_url:
                                "https://gitea.example.org/alice/writable-one",
                            clone_url:
                                "https://gitea.example.org/alice/writable-one.git",
                            default_branch: "master",
                            topics: ["consolidated"],
                            owner: { username: "alice" },
                            permissions: { push: true },
                        },
                        {
                            id: 2,
                            name: "read-only",
                            full_name: "someone/read-only",
                            html_url:
                                "https://gitea.example.org/someone/read-only",
                            default_branch: "main",
                            topics: ["consolidated"],
                            owner: { username: "someone" },
                            permissions: { push: false, write: false },
                        },
                    ],
                },
                {
                    headers: {
                        Link: '<https://gitea.example.org/api/v1/repos/search?page=2>; rel="next"',
                    },
                },
            ),
        );
        const provider = new GiteaRemoteRepoProvider(fetchImpl);

        const page = await provider.listWritableRepos({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "secret-token",
            page: 1,
            pageSize: 2,
            topic: "consolidated",
        });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
        expect(String(url)).toBe(
            "https://gitea.example.org/api/v1/repos/search?page=1&limit=2&private=true&q=consolidated&topic=true",
        );
        expect(init).toMatchObject({
            method: "GET",
            headers: {
                Authorization: "token secret-token",
                Accept: "application/json",
            },
        });
        expect(page).toEqual({
            repos: [
                {
                    id: "1",
                    owner: "alice",
                    name: "writable-one",
                    fullName: "alice/writable-one",
                    htmlUrl:
                        "https://gitea.example.org/alice/writable-one",
                    cloneUrl:
                        "https://gitea.example.org/alice/writable-one.git",
                    defaultBranch: "master",
                    topics: ["consolidated"],
                    canWrite: true,
                },
            ],
            nextPage: 2,
        });
    });

    it("falls back to the created-repo default branch when the server omits default_branch", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            jsonResponse({
                data: [
                    {
                        id: 9,
                        name: "writable-one",
                        full_name: "alice/writable-one",
                        html_url:
                            "https://gitea.example.org/alice/writable-one",
                        owner: { username: "alice" },
                        permissions: { admin: true },
                    },
                ],
            }),
        );
        const provider = new GiteaRemoteRepoProvider(fetchImpl);

        const page = await provider.listWritableRepos({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "secret-token",
            page: 1,
            pageSize: 20,
        });

        expect(page.repos[0]?.defaultBranch).toBe("master");
        expect(page.nextPage).toBeNull();
    });

    it("lists only owned repos by resolving the current user id first", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({
                    id: 42,
                    login: "alice",
                    username: "alice",
                }),
            )
            .mockResolvedValueOnce(
                jsonResponse(
                    {
                        data: [
                            {
                                id: 3,
                                name: "alice-bible",
                                full_name: "alice/alice-bible",
                                html_url:
                                    "https://gitea.example.org/alice/alice-bible",
                                clone_url:
                                    "https://gitea.example.org/alice/alice-bible.git",
                                default_branch: "master",
                                topics: ["consolidated"],
                                owner: { username: "alice" },
                                permissions: { write: true },
                            },
                        ],
                    },
                    {
                        headers: {
                            Link: '<https://gitea.example.org/api/v1/repos/search?page=2>; rel="next"',
                        },
                    },
                ),
            );
        const provider = new GiteaRemoteRepoProvider(fetchImpl);

        const page = await provider.listOwnedRepos({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "secret-token",
            page: 1,
            pageSize: 20,
            topic: "consolidated",
        });

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toBe(
            "https://gitea.example.org/api/v1/user",
        );
        expect(String(vi.mocked(fetchImpl).mock.calls[1]?.[0])).toBe(
            "https://gitea.example.org/api/v1/repos/search?page=1&limit=20&private=true&q=consolidated&topic=true&exclusive=true&uid=42",
        );
        expect(page).toEqual({
            repos: [
                {
                    id: "3",
                    owner: "alice",
                    name: "alice-bible",
                    fullName: "alice/alice-bible",
                    htmlUrl:
                        "https://gitea.example.org/alice/alice-bible",
                    cloneUrl:
                        "https://gitea.example.org/alice/alice-bible.git",
                    defaultBranch: "master",
                    topics: ["consolidated"],
                    canWrite: true,
                },
            ],
            nextPage: 2,
        });
    });

    it("creates a repo with the requested visibility and default branch", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            jsonResponse(
                {
                    id: 11,
                    name: "bho-bible",
                    full_name: "alice/bho-bible",
                    html_url: "https://gitea.example.org/alice/bho-bible",
                    clone_url: "https://gitea.example.org/alice/bho-bible.git",
                    default_branch: "master",
                    topics: ["consolidated"],
                    owner: { username: "alice" },
                    permissions: { admin: true },
                },
                { status: 201 },
            ),
        );
        const provider = new GiteaRemoteRepoProvider(fetchImpl);

        const repo = await provider.createRepo({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "secret-token",
            request: {
                name: "bho-bible",
                visibility: "public",
                topics: ["consolidated"],
                defaultBranch: "master",
            },
        });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
        expect(String(url)).toBe("https://gitea.example.org/api/v1/user/repos");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
            Authorization: "token secret-token",
            Accept: "application/json",
            "Content-Type": "application/json",
        });
        expect(JSON.parse(String(init?.body))).toEqual({
            name: "bho-bible",
            private: false,
            default_branch: "master",
            auto_init: false,
        });
        expect(repo).toMatchObject({
            id: "11",
            owner: "alice",
            name: "bho-bible",
            cloneUrl: "https://gitea.example.org/alice/bho-bible.git",
            defaultBranch: "master",
            canWrite: true,
        });
    });

    it("throws the response body when listing repos fails", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response("forbidden", { status: 403 }),
        );
        const provider = new GiteaRemoteRepoProvider(fetchImpl);

        await expect(
            provider.listWritableRepos({
                hostBaseUrl: "https://gitea.example.org",
                username: "alice",
                token: "secret-token",
                page: 1,
                pageSize: 20,
            }),
        ).rejects.toThrow("forbidden");
    });
});
