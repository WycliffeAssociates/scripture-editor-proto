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

/**
 * Two-query split:
 * - `browseQuery` is the always-on listing call (cached per scope, page size
 *   {@link UseGiteaApiArgs.browsePageSize}). Backs the default repo list when
 *   the user has not typed a meaningful search.
 * - `searchQuery` only fires when the typed query crosses
 *   {@link MIN_SEARCH_LENGTH} and is not low-signal. It hits the same endpoint
 *   with `searchQuery` set and a larger page size, cached per query string.
 *
 * Splitting them keeps the cheap browse list warm while live search spawns
 * its own cache-keyed query that does not invalidate the browse cache. The
 * `repos` memo merges them in search mode (search hits + locally-filtered
 * browse hits, deduped).
 */
export function useGiteaApi({
  sessionUsername,
  projectsService,
  topic,
  browsePageSize = 50,
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
  const hasSession = !!sessionUsername;
  const hasProjectsService = !!projectsService;
  const isSearchMode = normalizedQuery.length >= MIN_SEARCH_LENGTH;
  const isLowSignalSearch =
    isSearchMode && LOW_SIGNAL_SEARCH_TERMS.has(normalizedToken);
  const isBelowSearchThreshold = false;

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

  const browseQuery = useQuery({
    queryKey: [
      "giteaRepos",
      "browse",
      sessionUsername,
      scope,
      topic ?? "",
      browsePageSize,
    ],
    queryFn: async ({ signal }) =>
      await listRepos({
        scope,
        page: 1,
        pageSize: browsePageSize,
        signal,
      }),
    enabled: hasSession && hasProjectsService,
    placeholderData: keepPreviousData,
  });

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
      hasSession && hasProjectsService && isSearchMode && !isLowSignalSearch,
    placeholderData: keepPreviousData,
  });

  const browsedRepos = useMemo(
    () => browseQuery.data?.repos ?? [],
    [browseQuery.data?.repos],
  );

  const repos = useMemo(() => {
    if (!hasSession) {
      return [];
    }
    if (!isSearchMode) {
      if (!normalizedQuery) {
        return dedupeRepos(browsedRepos);
      }
      const localMatches = browsedRepos.filter((repo) =>
        matchesLocalRepoQuery(repo, normalizedQuery),
      );
      return dedupeRepos(localMatches);
    }
    const localMatches = browsedRepos.filter((repo) =>
      matchesLocalRepoQuery(repo, normalizedQuery),
    );
    const searchedRepos = searchQuery.data?.repos ?? [];
    return dedupeRepos([...searchedRepos, ...localMatches]);
  }, [
    browsedRepos,
    hasSession,
    isSearchMode,
    normalizedQuery,
    searchQuery.data?.repos,
  ]);

  const isLoading = isSearchMode
    ? searchQuery.isLoading || searchQuery.isFetching
    : browseQuery.isLoading || browseQuery.isFetching;
  const isInitialLoading = isSearchMode
    ? searchQuery.isLoading
    : browseQuery.isLoading;
  const isBackgroundFetching = isSearchMode
    ? searchQuery.isFetching && !searchQuery.isLoading
    : browseQuery.isFetching && !browseQuery.isLoading;
  const error = isSearchMode ? searchQuery.error : browseQuery.error;
  const hasLoaded = isSearchMode
    ? searchQuery.data !== undefined
    : browseQuery.data !== undefined;
  const activePageData = isSearchMode ? searchQuery.data : browseQuery.data;
  const hasAdditionalReposAvailable = Boolean(activePageData?.nextPage);
  const visiblePageSize = isSearchMode ? searchPageSize : browsePageSize;
  const rawResultCount = isSearchMode
    ? (searchQuery.data?.rawResultCount ?? 0)
    : (browseQuery.data?.rawResultCount ?? 0);
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
    minSearchLength: MIN_SEARCH_LENGTH,
    rawResultCount,
    error:
      !hasProjectsService && hasSession
        ? "Gitea project discovery is not configured."
        : error instanceof Error
          ? error.message
          : null,
    hasLoaded,
    hasAdditionalReposAvailable,
    visiblePageSize,
    refresh: async () => {
      if (!hasSession) return;
      if (isSearchMode) {
        await searchQuery.refetch();
        return;
      }
      await browseQuery.refetch();
    },
  };
}
