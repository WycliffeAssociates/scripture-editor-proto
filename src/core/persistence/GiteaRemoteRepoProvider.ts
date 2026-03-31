import * as v from "valibot";
import type {
    CreateRemoteRepoRequest,
    RemoteRepoPage,
    RemoteRepoProvider,
    RemoteRepoSummary,
} from "@/core/persistence/RemoteRepoProvider.ts";
import { REMOTE_REPO_CREATED_DEFAULT_BRANCH } from "@/core/persistence/RemoteRepoProvider.ts";

type FetchLike = typeof fetch;

/**
 * Gitea-backed repo catalog adapter.
 *
 * This file stays deliberately narrow: it translates the small slice of the
 * Gitea REST API that cloud-link flows need into the shared repo-catalog seam.
 * Transport/parsing lives here so the higher orchestration service can stay
 * focused on project linking and clone behavior rather than API details.
 */
const GiteaRepoOwnerSchema = v.object({
    login: v.optional(v.string()),
    username: v.optional(v.string()),
});

const GiteaRepoPermissionsSchema = v.object({
    admin: v.optional(v.boolean()),
    push: v.optional(v.boolean()),
    write: v.optional(v.boolean()),
});

const GiteaCurrentUserSchema = v.object({
    id: v.union([v.number(), v.string()]),
});

const GiteaRepoRecordSchema = v.object({
    id: v.optional(v.union([v.number(), v.string()])),
    name: v.optional(v.string()),
    full_name: v.optional(v.string()),
    html_url: v.optional(v.string()),
    clone_url: v.optional(v.string()),
    default_branch: v.optional(v.string()),
    topics: v.optional(v.array(v.string())),
    owner: v.optional(GiteaRepoOwnerSchema),
    permissions: v.optional(GiteaRepoPermissionsSchema),
});

const GiteaSearchResponseSchema = v.object({
    data: v.optional(v.array(GiteaRepoRecordSchema)),
});

const GiteaSearchPayloadSchema = v.union([
    v.array(GiteaRepoRecordSchema),
    GiteaSearchResponseSchema,
]);

type GiteaRepoRecord = v.InferOutput<typeof GiteaRepoRecordSchema>;
type GiteaSearchResponse = v.InferOutput<typeof GiteaSearchResponseSchema>;
type GiteaCurrentUser = v.InferOutput<typeof GiteaCurrentUserSchema>;

export class GiteaRemoteRepoProvider implements RemoteRepoProvider {
    constructor(private readonly fetchImpl: FetchLike = getDefaultFetch()) {}

    async listWritableRepos(args: {
        hostBaseUrl: string;
        username: string;
        token: string;
        page: number;
        pageSize: number;
        topic?: string;
    }): Promise<RemoteRepoPage> {
        return await this.listRepoPage({
            hostBaseUrl: args.hostBaseUrl,
            token: args.token,
            page: args.page,
            pageSize: args.pageSize,
            topic: args.topic,
            username: args.username,
            fallbackMessage: "Failed to list writable repositories",
            query: {},
            map: (repo) => mapRepoSummary(repo, args.username),
            filter: (repo) => mapRepoSummary(repo, args.username).canWrite,
        });
    }

    async listOwnedRepos(args: {
        hostBaseUrl: string;
        username: string;
        token: string;
        page: number;
        pageSize: number;
        topic?: string;
    }): Promise<RemoteRepoPage> {
        const userId = await this.resolveCurrentUserId(args);
        return await this.listRepoPage({
            hostBaseUrl: args.hostBaseUrl,
            token: args.token,
            page: args.page,
            pageSize: args.pageSize,
            topic: args.topic,
            username: args.username,
            fallbackMessage: "Failed to list owned repositories",
            query: {
                exclusive: "true",
                uid: userId,
            },
            map: (repo) => mapRepoSummary(repo, args.username),
        });
    }

    async createRepo(args: {
        hostBaseUrl: string;
        username: string;
        token: string;
        request: CreateRemoteRepoRequest;
    }): Promise<RemoteRepoSummary> {
        const response = await this.fetchImpl(
            new URL("/api/v1/user/repos", args.hostBaseUrl),
            {
                method: "POST",
                headers: {
                    ...buildAuthHeaders(args.token),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: args.request.name,
                    private: args.request.visibility === "private",
                    default_branch: args.request.defaultBranch,
                    auto_init: false,
                }),
            },
        );
        await throwIfNotOk(response, "Failed to create remote repository");

        const repo = parseGiteaRepoRecord(await response.json());
        return mapRepoSummary(repo, args.username);
    }

    private async listRepoPage(args: {
        hostBaseUrl: string;
        token: string;
        username: string;
        page: number;
        pageSize: number;
        topic?: string;
        query?: Record<string, string>;
        fallbackMessage: string;
        map: (repo: GiteaRepoRecord) => RemoteRepoSummary;
        filter?: (repo: GiteaRepoRecord) => boolean;
    }): Promise<RemoteRepoPage> {
        const response = await this.fetchImpl(
            buildRepoSearchUrl(args.hostBaseUrl, {
                page: args.page,
                pageSize: args.pageSize,
                topic: args.topic,
                query: args.query,
            }),
            {
                method: "GET",
                headers: buildAuthHeaders(args.token),
            },
        );
        await throwIfNotOk(response, args.fallbackMessage);

        const payload = parseGiteaSearchPayload(await response.json());
        const repoRecords = extractRepoRecords(payload);
        const filteredRecords = repoRecords.filter(
            args.filter ?? ((repo) => isWritableRepo(repo, args.username)),
        );
        const repos = filteredRecords.map(args.map);

        return {
            repos,
            nextPage: hasNextPage(
                response,
                args.page,
                args.pageSize,
                repoRecords.length,
            )
                ? args.page + 1
                : null,
        };
    }

    private async resolveCurrentUserId(args: {
        hostBaseUrl: string;
        token: string;
    }): Promise<string> {
        const response = await this.fetchImpl(
            new URL("/api/v1/user", args.hostBaseUrl),
            {
                method: "GET",
                headers: buildAuthHeaders(args.token),
            },
        );
        await throwIfNotOk(response, "Failed to resolve the current user");
        const currentUser = parseGiteaCurrentUser(await response.json());
        return String(currentUser.id);
    }
}

function getDefaultFetch(): FetchLike {
    return globalThis.fetch.bind(globalThis);
}

function parseGiteaSearchPayload(
    payload: unknown,
): GiteaSearchResponse | GiteaRepoRecord[] {
    return v.parse(GiteaSearchPayloadSchema, payload);
}

function parseGiteaRepoRecord(payload: unknown): GiteaRepoRecord {
    return v.parse(GiteaRepoRecordSchema, payload);
}

function parseGiteaCurrentUser(payload: unknown): GiteaCurrentUser {
    return v.parse(GiteaCurrentUserSchema, payload);
}

function extractRepoRecords(
    payload: GiteaSearchResponse | GiteaRepoRecord[],
): GiteaRepoRecord[] {
    if (Array.isArray(payload)) {
        return payload;
    }
    return payload.data ?? [];
}

function buildRepoSearchUrl(
    hostBaseUrl: string,
    args: {
        page: number;
        pageSize: number;
        topic?: string;
        query?: Record<string, string>;
    },
): URL {
    const url = new URL("/api/v1/repos/search", hostBaseUrl);
    url.searchParams.set("page", String(args.page));
    url.searchParams.set("limit", String(args.pageSize));
    url.searchParams.set("private", "true");
    if (args.topic) {
        url.searchParams.set("q", args.topic);
        url.searchParams.set("topic", "true");
    }
    for (const [key, value] of Object.entries(args.query ?? {})) {
        url.searchParams.set(key, value);
    }
    return url;
}

function mapRepoSummary(
    repo: GiteaRepoRecord,
    username: string,
): RemoteRepoSummary {
    const owner = repo.owner?.username || repo.owner?.login || username;
    const name = repo.name || "unknown";
    return {
        id: String(repo.id ?? `${owner}/${name}`),
        owner,
        name,
        fullName: repo.full_name || `${owner}/${name}`,
        htmlUrl: repo.html_url || "",
        cloneUrl: repo.clone_url || `${repo.html_url || ""}.git`,
        defaultBranch:
            repo.default_branch || REMOTE_REPO_CREATED_DEFAULT_BRANCH,
        topics: repo.topics ?? [],
        canWrite:
            repo.permissions?.admin === true ||
            repo.permissions?.push === true ||
            repo.permissions?.write === true ||
            owner === username,
    };
}

function isWritableRepo(repo: GiteaRepoRecord, username: string): boolean {
    return (
        repo.permissions?.admin === true ||
        repo.permissions?.push === true ||
        repo.permissions?.write === true ||
        (repo.owner?.username || repo.owner?.login || username) === username
    );
}

function buildAuthHeaders(token: string): HeadersInit {
    return {
        Authorization: `token ${token}`,
        Accept: "application/json",
    };
}

async function throwIfNotOk(response: Response, fallbackMessage: string) {
    if (response.ok) return;
    let details = "";
    try {
        details = await response.text();
    } catch {
        details = "";
    }
    throw new Error(details || fallbackMessage);
}

function hasNextPage(
    response: Response,
    currentPage: number,
    pageSize: number,
    returnedCount: number,
): boolean {
    const link = response.headers.get("link") ?? response.headers.get("Link");
    if (link) {
        return /rel="?next"?/i.test(link);
    }
    return returnedCount >= pageSize && currentPage >= 1;
}
