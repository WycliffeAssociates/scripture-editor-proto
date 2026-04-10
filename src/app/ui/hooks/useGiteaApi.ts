import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";

type RepoScope = "all" | "owned";
const MIN_SEARCH_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 200;
const LOW_SIGNAL_SEARCH_TERMS = new Set(["reg", "ulb"]);

type GiteaProjectsService = {
    listWritableRemoteRepos: (args: {
        page: number;
        pageSize: number;
        topic?: string;
        searchQuery?: string;
        signal?: AbortSignal;
    }) => Promise<{
        repos: RemoteRepoSummary[];
        nextPage: number | null;
        rawResultCount: number;
    }>;
    listOwnedRemoteRepos: (args: {
        page: number;
        pageSize: number;
        topic?: string;
        searchQuery?: string;
        signal?: AbortSignal;
    }) => Promise<{
        repos: RemoteRepoSummary[];
        nextPage: number | null;
        rawResultCount: number;
    }>;
};

type UseGiteaApiArgs = {
    sessionUsername: string | null;
    projectsService?: GiteaProjectsService | null;
    topic?: string;
    browsePageSize?: number;
    searchPageSize?: number;
    initialScope?: RepoScope;
    initialQuery?: string;
};

function matchesLocalRepoQuery(
    repo: RemoteRepoSummary,
    normalizedQuery: string,
) {
    if (!normalizedQuery) return true;
    return [repo.fullName, repo.name, repo.owner, repo.defaultBranch].some(
        (value) => value.toLowerCase().includes(normalizedQuery),
    );
}

function dedupeRepos(repos: RemoteRepoSummary[]) {
    const seen = new Set<string>();
    return repos.filter((repo) => {
        const key = `${repo.id}:${repo.fullName}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function normalizeSearchToken(value: string) {
    return value.trim().toLowerCase().replace(/^_+/u, "");
}

export function useGiteaApi({
    sessionUsername,
    projectsService,
    topic,
    searchPageSize = 100,
    initialScope = "all",
    initialQuery = "",
}: UseGiteaApiArgs) {
    const [scope, setScope] = useState<RepoScope>(initialScope);
    const [query, setQuery] = useState(initialQuery);
    const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedQuery(query);
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timeoutId);
    }, [query]);

    const trimmedQuery = debouncedQuery.trim();
    const normalizedQuery = trimmedQuery.toLowerCase();
    const normalizedToken = normalizeSearchToken(trimmedQuery);
    const hasSession = Boolean(sessionUsername);
    const hasProjectsService = Boolean(projectsService);
    const isSearchEligible = normalizedQuery.length >= MIN_SEARCH_LENGTH;
    const isLowSignalSearch =
        isSearchEligible && LOW_SIGNAL_SEARCH_TERMS.has(normalizedToken);
    const isSearchMode = isSearchEligible;
    const isBelowSearchThreshold =
        normalizedQuery.length > 0 &&
        normalizedQuery.length < MIN_SEARCH_LENGTH;

    const listRepos = async (args: {
        scope: RepoScope;
        page: number;
        pageSize: number;
        searchQuery?: string;
        signal?: AbortSignal;
    }) => {
        if (args.scope === "owned") {
            if (!projectsService) {
                throw new Error("Gitea project discovery is not configured.");
            }
            return await projectsService.listOwnedRemoteRepos({
                page: args.page,
                pageSize: args.pageSize,
                topic,
                searchQuery: args.searchQuery,
                signal: args.signal,
            });
        }
        if (!projectsService) {
            throw new Error("Gitea project discovery is not configured.");
        }
        return await projectsService.listWritableRemoteRepos({
            page: args.page,
            pageSize: args.pageSize,
            topic,
            searchQuery: args.searchQuery,
            signal: args.signal,
        });
    };

    const searchQuery = useQuery({
        queryKey: [
            "giteaRepos",
            "search",
            sessionUsername,
            scope,
            topic ?? "",
            trimmedQuery,
            searchPageSize,
        ],
        queryFn: async ({ signal }) =>
            await listRepos({
                scope,
                page: 1,
                pageSize: searchPageSize,
                searchQuery: trimmedQuery,
                signal,
            }),
        enabled:
            hasSession &&
            hasProjectsService &&
            isSearchMode &&
            !isLowSignalSearch,
        placeholderData: keepPreviousData,
    });

    const browsedRepos = useMemo(() => [], []);

    const repos = useMemo(() => {
        if (!hasSession) {
            return [];
        }
        if (!isSearchMode) {
            return [];
        }
        const cachedMatches = browsedRepos.filter((repo) =>
            matchesLocalRepoQuery(repo, normalizedQuery),
        );
        const searchedRepos = searchQuery.data?.repos ?? [];
        return dedupeRepos([...searchedRepos, ...cachedMatches]);
    }, [
        browsedRepos,
        hasSession,
        isSearchMode,
        normalizedQuery,
        searchQuery.data?.repos,
    ]);

    const isLoading = isSearchMode
        ? searchQuery.isLoading || searchQuery.isFetching
        : false;
    const isInitialLoading = isSearchMode ? searchQuery.isLoading : false;
    const isBackgroundFetching = isSearchMode
        ? searchQuery.isFetching && !searchQuery.isLoading
        : false;
    const isFetchingMore = false;
    const error = searchQuery.error;
    const hasLoaded = isSearchMode ? searchQuery.data !== undefined : false;
    const hasNextPage = false;
    const rawResultCount = searchQuery.data?.rawResultCount ?? 0;
    const hasOnlyIncompatibleResults =
        isSearchMode && rawResultCount > 0 && repos.length === 0;

    return {
        scope,
        setScope,
        query,
        setQuery,
        normalizedQuery,
        debouncedQuery,
        isBelowSearchThreshold,
        isSearchMode,
        isLowSignalSearch,
        hasOnlyIncompatibleResults,
        repos,
        isLoading,
        isInitialLoading,
        isBackgroundFetching,
        isFetchingMore,
        minSearchLength: MIN_SEARCH_LENGTH,
        rawResultCount,
        error:
            !hasProjectsService && hasSession
                ? "Gitea project discovery is not configured."
                : error instanceof Error
                  ? error.message
                  : null,
        hasLoaded,
        hasNextPage,
        refresh: async () => {
            if (!hasSession) return;
            if (isSearchMode) {
                await searchQuery.refetch();
            }
        },
        loadMore: async () => {
            return;
        },
    };
}
