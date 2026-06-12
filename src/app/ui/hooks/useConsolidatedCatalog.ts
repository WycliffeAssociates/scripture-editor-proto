import { useQuery } from "@tanstack/react-query";

import {
  type ConsolidatedRepo,
  fetchConsolidatedRepos,
} from "@/core/domain/project/import/LanguageApiImporter.ts";

const CONSOLIDATED_CATALOG_QUERY_KEY = ["consolidatedCatalog"] as const;

export type UseConsolidatedCatalogResult = {
  repos: ConsolidatedRepo[] | null;
  isLoading: boolean;
  isError: boolean;
  /** The error message, when one is available; otherwise null. */
  errorMessage: string | null;
  refetch: () => void;
};

/**
 * Shared data-fetching hook for the consolidated-repos catalog — the
 * REST-over-Hasura `vw_consolidated_repos` view (`fetchConsolidatedRepos`).
 *
 * This is the authoritative list of "consolidated" projects: the bible-shaped
 * question the generic Gitea API can't answer. Both the create page's
 * `SourcePicker` and the attach picker read it, so it lives here as a cached,
 * deduped query rather than a per-component `useEffect` — fetching belongs in a
 * reusable hook, not in the container.
 *
 * Callers localize the fallback copy themselves (the hook stays i18n-free); use
 * `errorMessage ?? t\`…\`` at the call site.
 */
export function useConsolidatedCatalog(): UseConsolidatedCatalogResult {
  const query = useQuery({
    queryKey: CONSOLIDATED_CATALOG_QUERY_KEY,
    queryFn: () => fetchConsolidatedRepos(),
    // The catalog changes rarely; keep it warm across the create page and
    // the attach picker so navigating between them doesn't refetch.
    staleTime: 5 * 60_000,
  });

  return {
    repos: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error instanceof Error ? query.error.message : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
