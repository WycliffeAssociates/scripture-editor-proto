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
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({ id: 7, login: "alice", username: "alice" }),
            )
            .mockResolvedValueOnce(
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

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toBe(
            "https://gitea.example.org/api/v1/user",
        );
        const [url, init] = vi.mocked(fetchImpl).mock.calls[1]!;
        expect(String(url)).toBe(
            "https://gitea.example.org/api/v1/repos/search?page=1&limit=2&private=true&q=consolidated&topic=true&uid=7",
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
            rawResultCount: 2,
        });
    });

    it("preserves the API clone_url so web git can route through corsProxy", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({ id: 7, login: "alice", username: "alice" }),
            )
            .mockResolvedValueOnce(
            jsonResponse({
                data: [
                    {
                        id: 1,
                        name: "writable-one",
                        full_name: "alice/writable-one",
                        html_url:
                            "https://content.bibletranslationtools.org/alice/writable-one",
                        clone_url:
                            "https://content.bibletranslationtools.org/alice/writable-one.git",
                        default_branch: "master",
                        owner: { username: "alice" },
                        permissions: { push: true },
                    },
                ],
            }),
        );
        const provider = new GiteaRemoteRepoProvider(fetchImpl);

        const page = await provider.listWritableRepos({
            hostBaseUrl: "https://git-proxy.example.org",
            username: "alice",
            token: "secret-token",
            page: 1,
            pageSize: 20,
        });

        expect(page.repos[0]?.cloneUrl).toBe(
            "https://content.bibletranslationtools.org/alice/writable-one.git",
        );
    });

    it("falls back to the created-repo default branch when the server omits default_branch", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({ id: 7, login: "alice", username: "alice" }),
            )
            .mockResolvedValueOnce(
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
            rawResultCount: 1,
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

        expect(fetchImpl).toHaveBeenCalledTimes(2);
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

        // Topics aren't accepted by the create endpoint, so they're applied via
        // a follow-up PUT — required here because the `consolidated` topic is
        // what makes the new remote writable in this ecosystem.
        const [topicsUrl, topicsInit] = vi.mocked(fetchImpl).mock.calls[1]!;
        expect(String(topicsUrl)).toBe(
            "https://gitea.example.org/api/v1/repos/alice/bho-bible/topics",
        );
        expect(topicsInit?.method).toBe("PUT");
        expect(JSON.parse(String(topicsInit?.body))).toEqual({
            topics: ["consolidated"],
        });

        expect(repo).toMatchObject({
            id: "11",
            owner: "alice",
            name: "bho-bible",
            cloneUrl: "https://gitea.example.org/alice/bho-bible.git",
            defaultBranch: "master",
            topics: ["consolidated"],
            canWrite: true,
        });
    });

    it("forks a repo into the caller's account and ensures the consolidated topic", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse(
                    {
                        id: 21,
                        name: "bho-bible",
                        full_name: "alice/bho-bible",
                        html_url: "https://gitea.example.org/alice/bho-bible",
                        clone_url:
                            "https://gitea.example.org/alice/bho-bible.git",
                        default_branch: "master",
                        // Fork inherited an unrelated topic; consolidated is
                        // added, not replaced.
                        topics: ["draft"],
                        owner: { username: "alice" },
                        permissions: { admin: true },
                    },
                    { status: 202 },
                ),
            )
            // Follow-up topics PUT.
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const provider = new GiteaRemoteRepoProvider(fetchImpl);

        const repo = await provider.forkRepo({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "secret-token",
            owner: "source-org",
            name: "bho-bible",
            topics: ["consolidated"],
        });

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const [forkUrl, forkInit] = vi.mocked(fetchImpl).mock.calls[0]!;
        expect(String(forkUrl)).toBe(
            "https://gitea.example.org/api/v1/repos/source-org/bho-bible/forks",
        );
        expect(forkInit?.method).toBe("POST");

        const [topicsUrl, topicsInit] = vi.mocked(fetchImpl).mock.calls[1]!;
        expect(String(topicsUrl)).toBe(
            "https://gitea.example.org/api/v1/repos/alice/bho-bible/topics",
        );
        expect(topicsInit?.method).toBe("PUT");
        expect(JSON.parse(String(topicsInit?.body))).toEqual({
            topics: ["draft", "consolidated"],
        });

        expect(repo).toMatchObject({
            owner: "alice",
            name: "bho-bible",
            topics: ["draft", "consolidated"],
            canWrite: true,
        });
    });

    it("resolves the existing fork when the caller already forked the repo", async () => {
        const fetchImpl = vi
            .fn()
            // POST /forks → already forked.
            .mockResolvedValueOnce(new Response("already forked", { status: 409 }))
            // GET /repos/{caller}/{name} → the existing fork (a fork of the
            // requested source), already tagged. Topics + fork/parent come back
            // inline on the single-repo GET.
            .mockResolvedValueOnce(
                jsonResponse({
                    id: 31,
                    name: "bho-bible",
                    full_name: "alice/bho-bible",
                    html_url: "https://gitea.example.org/alice/bho-bible",
                    clone_url: "https://gitea.example.org/alice/bho-bible.git",
                    default_branch: "master",
                    topics: ["consolidated"],
                    owner: { username: "alice" },
                    permissions: { admin: true },
                    fork: true,
                    parent: { full_name: "source-org/bho-bible" },
                }),
            );
        const provider = new GiteaRemoteRepoProvider(fetchImpl);

        const repo = await provider.forkRepo({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "secret-token",
            owner: "source-org",
            name: "bho-bible",
            topics: ["consolidated"],
        });

        // POST forks + GET existing fork; no topics PUT (already consolidated).
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(String(vi.mocked(fetchImpl).mock.calls[1]?.[0])).toBe(
            "https://gitea.example.org/api/v1/repos/alice/bho-bible",
        );
        expect(repo).toMatchObject({
            owner: "alice",
            name: "bho-bible",
            topics: ["consolidated"],
            canWrite: true,
        });
    });

    it("refuses to reuse an unrelated same-named repo on fork conflict", async () => {
        const fetchImpl = vi
            .fn()
            // POST /forks → 409 (a repo of this name already exists).
            .mockResolvedValueOnce(
                new Response("already exists", { status: 409 }),
            )
            // GET /repos/{caller}/{name} → an UNRELATED repo: not a fork of the
            // requested source (in fact not a fork at all).
            .mockResolvedValueOnce(
                jsonResponse({
                    id: 99,
                    name: "bho-bible",
                    full_name: "alice/bho-bible",
                    html_url: "https://gitea.example.org/alice/bho-bible",
                    clone_url: "https://gitea.example.org/alice/bho-bible.git",
                    default_branch: "master",
                    topics: ["my-own-thing"],
                    owner: { username: "alice" },
                    permissions: { admin: true },
                    fork: false,
                }),
            );
        const provider = new GiteaRemoteRepoProvider(fetchImpl);

        await expect(
            provider.forkRepo({
                hostBaseUrl: "https://gitea.example.org",
                username: "alice",
                token: "secret-token",
                owner: "source-org",
                name: "bho-bible",
                topics: ["consolidated"],
            }),
        ).rejects.toThrow(/isn't a copy of source-org\/bho-bible/u);

        // POST + GET only — must NOT have mutated the unrelated repo's topics.
        expect(fetchImpl).toHaveBeenCalledTimes(2);
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

    it("inspects scripture burrito metadata from a remote repo", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            jsonResponse({
                type: "file",
                encoding: "base64",
                content: btoa(
                    JSON.stringify({
                        meta: { version: "1.0" },
                        languages: [
                            {
                                tag: "bem",
                                name: { en: "Bemba" },
                            },
                        ],
                        ingredients: {
                            "01-GEN.usfm": {
                                checksum: { md5: "abc" },
                                size: 1,
                                mimeType: "text/usfm",
                            },
                        },
                        type: {
                            flavorType: {
                                name: "scripture",
                                flavor: {
                                    name: "textTranslation",
                                    projectType: "standard",
                                },
                            },
                        },
                    }),
                ),
            }),
        );
        const provider = new GiteaRemoteRepoProvider(fetchImpl);

        await expect(
            provider.inspectProjectMetadata({
                hostBaseUrl: "https://gitea.example.org",
                token: "secret-token",
                repoOwner: "alice",
                repoName: "bem-ulb",
                ref: "master",
            }),
        ).resolves.toEqual({
            format: "scripture-burrito",
            metadataPath: "metadata.json",
            languageTag: "bem",
            isScriptureTextTranslation: true,
        });
    });

    it("falls back to manifest.yaml when metadata.json is absent", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(new Response("missing", { status: 404 }))
            .mockResolvedValueOnce(
                jsonResponse({
                    type: "file",
                    encoding: "base64",
                    content: btoa(`dublin_core:
  identifier: bem_ulb
  subject: Bible
  format: text/usfm
  language:
    identifier: bem
    title: Bemba
projects: []
`),
                }),
            );
        const provider = new GiteaRemoteRepoProvider(fetchImpl);

        await expect(
            provider.inspectProjectMetadata({
                hostBaseUrl: "https://gitea.example.org",
                token: "secret-token",
                repoOwner: "alice",
                repoName: "bem-ulb",
                ref: "master",
            }),
        ).resolves.toEqual({
            format: "resource-container",
            metadataPath: "manifest.yaml",
            languageTag: "bem",
            isScriptureTextTranslation: true,
        });
    });
});
