import * as v from "valibot";
import { classifyResourceKindFromResourceContainer } from "@/core/domain/project/referenceItemLoading.ts";
import { parseResourceContainer } from "@/core/domain/project/resourceContainer/resourceContainer.ts";
import { tryParseScriptureBurritoMetadata } from "@/core/domain/project/scriptureBurritoSchemas.ts";
import type {
    CreateRemoteRepoRequest,
    RemoteRepoPage,
    RemoteRepoProjectMetadata,
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

const GiteaRepoContentSchema = v.object({
    content: v.optional(v.string()),
    encoding: v.optional(v.string()),
    type: v.optional(v.string()),
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
        searchQuery?: string;
        signal?: AbortSignal;
    }): Promise<RemoteRepoPage> {
        return await this.listRepoPage({
            hostBaseUrl: args.hostBaseUrl,
            token: args.token,
            page: args.page,
            pageSize: args.pageSize,
            topic: args.topic,
            searchQuery: args.searchQuery,
            signal: args.signal,
            username: args.username,
            fallbackMessage: "Failed to list writable repositories",
            query: {},
            map: (repo) =>
                mapRepoSummary(repo, args.username, args.hostBaseUrl),
            filter: (repo) =>
                mapRepoSummary(repo, args.username, args.hostBaseUrl).canWrite,
        });
    }

    async listOwnedRepos(args: {
        hostBaseUrl: string;
        username: string;
        token: string;
        page: number;
        pageSize: number;
        topic?: string;
        searchQuery?: string;
        signal?: AbortSignal;
    }): Promise<RemoteRepoPage> {
        const userId = await this.resolveCurrentUserId(args);
        return await this.listRepoPage({
            hostBaseUrl: args.hostBaseUrl,
            token: args.token,
            page: args.page,
            pageSize: args.pageSize,
            topic: args.topic,
            searchQuery: args.searchQuery,
            signal: args.signal,
            username: args.username,
            fallbackMessage: "Failed to list owned repositories",
            query: {
                exclusive: "true",
                uid: userId,
            },
            map: (repo) =>
                mapRepoSummary(repo, args.username, args.hostBaseUrl),
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
        return mapRepoSummary(repo, args.username, args.hostBaseUrl);
    }

    async inspectProjectMetadata(args: {
        hostBaseUrl: string;
        token: string;
        repoOwner: string;
        repoName: string;
        ref?: string;
    }): Promise<RemoteRepoProjectMetadata | null> {
        const metadataText = await this.readRepoFileText({
            ...args,
            filePath: "metadata.json",
        });
        if (metadataText) {
            return inspectScriptureBurritoMetadata(metadataText);
        }

        const manifestText = await this.readRepoFileText({
            ...args,
            filePath: "manifest.yaml",
        });
        if (manifestText) {
            return inspectResourceContainerMetadata(manifestText);
        }

        return null;
    }

    private async listRepoPage(args: {
        hostBaseUrl: string;
        token: string;
        username: string;
        page: number;
        pageSize: number;
        topic?: string;
        searchQuery?: string;
        signal?: AbortSignal;
        query?: Record<string, string>;
        fallbackMessage: string;
        map: (repo: GiteaRepoRecord) => RemoteRepoSummary;
        filter?: (repo: GiteaRepoRecord) => boolean;
    }): Promise<RemoteRepoPage> {
        const collectedRepos: GiteaRepoRecord[] = [];
        let rawResultCount = 0;
        let currentPage = args.page;
        let hasMorePages = false;

        while (true) {
            const response = await this.fetchImpl(
                buildRepoSearchUrl(args.hostBaseUrl, {
                    page: currentPage,
                    pageSize: args.pageSize,
                    topic: args.topic,
                    query: args.query,
                    searchQuery: args.searchQuery,
                }),
                {
                    method: "GET",
                    headers: buildAuthHeaders(args.token),
                    signal: args.signal,
                },
            );
            await throwIfNotOk(response, args.fallbackMessage);

            const payload = parseGiteaSearchPayload(await response.json());
            const repoRecords = extractRepoRecords(payload);
            rawResultCount += repoRecords.length;
            const filteredRecords = repoRecords.filter(
                (repo) =>
                    repoMatchesTopic(repo, args.topic) &&
                    (
                        args.filter ??
                        ((candidate) =>
                            isWritableRepo(candidate, args.username))
                    )(repo),
            );
            collectedRepos.push(...filteredRecords);

            hasMorePages = hasNextPage(
                response,
                currentPage,
                args.pageSize,
                repoRecords.length,
            );
            const shouldContinueSearch =
                Boolean(args.searchQuery?.trim()) &&
                collectedRepos.length < args.pageSize &&
                hasMorePages;
            if (!shouldContinueSearch) {
                break;
            }
            currentPage += 1;
        }

        const repos = collectedRepos.slice(0, args.pageSize).map(args.map);

        return {
            repos,
            nextPage: hasMorePages ? currentPage + 1 : null,
            rawResultCount,
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

    private async readRepoFileText(args: {
        hostBaseUrl: string;
        token: string;
        repoOwner: string;
        repoName: string;
        filePath: string;
        ref?: string;
    }): Promise<string | null> {
        const response = await this.fetchImpl(
            buildRepoContentsUrl(args.hostBaseUrl, {
                repoOwner: args.repoOwner,
                repoName: args.repoName,
                filePath: args.filePath,
                ref: args.ref,
            }),
            {
                method: "GET",
                headers: buildAuthHeaders(args.token),
            },
        );

        if (response.status === 404) {
            return null;
        }

        await throwIfNotOk(
            response,
            `Failed to inspect ${args.filePath} in remote repository`,
        );

        const payload = parseGiteaRepoContent(await response.json());
        if (payload.type && payload.type !== "file") {
            throw new Error(
                `Expected ${args.filePath} to be a file in remote repository`,
            );
        }
        if (!payload.content) {
            throw new Error(
                `Remote repository response did not include ${args.filePath} contents`,
            );
        }

        return decodeBase64Content(payload.content);
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

function parseGiteaRepoContent(payload: unknown) {
    return v.parse(GiteaRepoContentSchema, payload);
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
        searchQuery?: string;
        query?: Record<string, string>;
    },
): URL {
    const url = new URL("/api/v1/repos/search", hostBaseUrl);
    url.searchParams.set("page", String(args.page));
    url.searchParams.set("limit", String(args.pageSize));
    url.searchParams.set("private", "true");
    const normalizedSearch = args.searchQuery?.trim();
    if (normalizedSearch) {
        url.searchParams.set("q", normalizedSearch);
    } else if (args.topic) {
        url.searchParams.set("q", args.topic);
        url.searchParams.set("topic", "true");
    }
    for (const [key, value] of Object.entries(args.query ?? {})) {
        url.searchParams.set(key, value);
    }
    return url;
}

function buildRepoContentsUrl(
    hostBaseUrl: string,
    args: {
        repoOwner: string;
        repoName: string;
        filePath: string;
        ref?: string;
    },
): URL {
    const encodedOwner = encodeURIComponent(args.repoOwner);
    const encodedName = encodeURIComponent(args.repoName);
    const encodedPath = args.filePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    const url = new URL(
        `/api/v1/repos/${encodedOwner}/${encodedName}/contents/${encodedPath}`,
        hostBaseUrl,
    );
    if (args.ref) {
        url.searchParams.set("ref", args.ref);
    }
    return url;
}

function mapRepoSummary(
    repo: GiteaRepoRecord,
    username: string,
    hostBaseUrl: string,
): RemoteRepoSummary {
    const owner = repo.owner?.username || repo.owner?.login || username;
    const name = repo.name || "unknown";
    const htmlUrl = repo.html_url || "";
    return {
        id: String(repo.id ?? `${owner}/${name}`),
        owner,
        name,
        fullName: repo.full_name || `${owner}/${name}`,
        htmlUrl,
        cloneUrl:
            repo.clone_url ||
            buildCloneUrlFromHtmlUrl(htmlUrl) ||
            buildCloneUrlFromHost(hostBaseUrl, owner, name),
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

function repoMatchesTopic(repo: GiteaRepoRecord, topic?: string): boolean {
    const normalizedTopic = topic?.trim().toLowerCase();
    if (!normalizedTopic) {
        return true;
    }
    return (repo.topics ?? []).some(
        (repoTopic) => repoTopic.trim().toLowerCase() === normalizedTopic,
    );
}

function buildAuthHeaders(token: string): HeadersInit {
    return {
        Authorization: `token ${token}`,
        Accept: "application/json",
    };
}

function buildCloneUrlFromHost(
    hostBaseUrl: string,
    owner: string,
    repoName: string,
): string {
    return new URL(
        `/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}.git`,
        hostBaseUrl,
    ).toString();
}

function buildCloneUrlFromHtmlUrl(htmlUrl: string): string | null {
    const trimmed = htmlUrl.trim();
    if (!trimmed) {
        return null;
    }
    return `${trimmed.replace(/\/+$/u, "")}.git`;
}

function decodeBase64Content(content: string): string {
    const normalized = content.replace(/\s+/gu, "");
    const binary = globalThis.atob(normalized);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function inspectScriptureBurritoMetadata(
    metadataText: string,
): RemoteRepoProjectMetadata {
    const [metadata] = tryParseScriptureBurritoMetadata(
        JSON.parse(metadataText),
    );
    if (!metadata) {
        throw new Error(
            "Remote metadata.json is not a valid Scripture Burrito file",
        );
    }

    return {
        format: "scripture-burrito",
        metadataPath: "metadata.json",
        languageTag: metadata.languages?.[0]?.tag ?? null,
        isScriptureTextTranslation:
            normalizeMetadataToken(metadata.type?.flavorType?.name) ===
                "scripture" &&
            normalizeMetadataToken(metadata.type?.flavorType?.flavor?.name) ===
                "texttranslation" &&
            normalizeMetadataToken(
                metadata.type?.flavorType?.flavor?.projectType,
            ) === "standard",
    };
}

function inspectResourceContainerMetadata(
    manifestText: string,
): RemoteRepoProjectMetadata {
    const manifest = parseResourceContainer(manifestText);
    return {
        format: "resource-container",
        metadataPath: "manifest.yaml",
        languageTag: manifest.dublin_core?.language?.identifier ?? null,
        isScriptureTextTranslation:
            classifyResourceKindFromResourceContainer({
                identifier: manifest.dublin_core?.identifier,
                title: manifest.dublin_core?.title,
                subject: manifest.dublin_core?.subject,
                format: manifest.dublin_core?.format,
            }) === "usfmScripture",
    };
}

function normalizeMetadataToken(value?: string | null): string {
    return value?.trim().toLowerCase() ?? "";
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
