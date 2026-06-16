import { useEffect, useMemo, useState } from "react";

import { GIT_REMOTE_DEFAULT_TOPIC } from "@/app/domain/project/gitRemoteProjectService.ts";
import { useConsolidatedCatalog } from "@/app/ui/hooks/useConsolidatedCatalog.ts";
import type { ConsolidatedRepo } from "@/core/domain/project/import/LanguageApiImporter.ts";
import { parseWacsRepoUrl } from "@/core/domain/project/import/wacsRepoProbe.ts";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";
import type { GetRemoteRepoArgs } from "@/core/persistence/WorkspaceService.ts";

/**
 * Lifecycle of turning a chosen project into something attachable. The catalog
 * only carries owner/name, so on select (or on a pasted link) we fetch the repo
 * to learn its clone URL / default branch, whether we can write to it, and
 * whether it's a shared project (carries the `consolidated` topic).
 *
 * - `writable` — writable AND a shared project: attachable.
 * - `not-writable` — no edit access: offer to save your own copy (fork).
 * - `not-shared` — writable but NOT a shared project: can't attach (the
 *   catalog can't surface these, but a pasted link can reach one).
 */
/** BCP-47 primary language subtag, lowercased (`nya-x-ny` → `nya`, `es-419` → `es`). */
function primaryLanguageSubtag(code: string | null | undefined): string {
  return (code ?? "").trim().toLowerCase().split(/[-_]/u)[0] ?? "";
}

export type AttachResolveState =
  | "idle"
  | "resolving"
  | "writable"
  | "not-writable"
  | "not-shared"
  | "error";

export interface SharedProjectPicker {
  /** Projects to choose from: yours by default; the whole catalog when searching. */
  catalogRepos: ConsolidatedRepo[];
  catalogQuery: string;
  setCatalogQuery: (query: string) => void;
  isCatalogLoading: boolean;
  /** True when the catalog fetch failed; pair with {@link catalogErrorMessage}. */
  isCatalogError: boolean;
  /** Raw catalog error (callers localize the fallback). */
  catalogErrorMessage: string | null;
  selectedRepo: ConsolidatedRepo | null;
  setSelectedRepo: (repo: ConsolidatedRepo | null) => void;
  resolveState: AttachResolveState;
  /** The resolved repo once `resolveState` is `writable`/`not-writable`. */
  resolvedRepo: RemoteRepoSummary | null;
  /**
   * `owner/repo` when the search box holds a project link under the configured
   * host, else null. Lets the picker bypass the catalog and resolve the repo
   * directly — Git is the source of record, so a freshly-created project is
   * attachable here before it propagates into the catalog.
   */
  linkTargetLabel: string | null;
}

/**
 * The domain logic behind the "attach to a shared project" pickers (the cloud
 * status popover and the settings advanced tab). Keeping it in one hook is what
 * lets those two surfaces share behavior instead of drifting apart.
 *
 * Two ways to pick a target, one resolver:
 * - search the catalog and select a project, or
 * - paste a link under the configured host (`parseWacsRepoUrl`) — the same
 *   host-matcher the create page uses — which wins over a catalog pick.
 *
 * A pasted link wins because Git is the source of record: a project created
 * moments ago is attachable before it reaches the Hasura catalog.
 */
export function useSharedProjectPicker(args: {
  projectsService: {
    getRemoteRepo: (
      args: GetRemoteRepoArgs,
    ) => Promise<RemoteRepoSummary | null>;
  };
  giteaHostBaseUrl: string | null;
  sessionUsername: string | null;
  /** The open project's IETF language code — floats matching projects to the top. */
  currentLanguageCode?: string | null;
}): SharedProjectPicker {
  const {
    projectsService,
    giteaHostBaseUrl,
    sessionUsername,
    currentLanguageCode,
  } = args;
  const catalog = useConsolidatedCatalog();
  const [catalogQuery, setCatalogQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<ConsolidatedRepo | null>(
    null,
  );
  const [resolvedRepo, setResolvedRepo] = useState<RemoteRepoSummary | null>(
    null,
  );
  const [resolveState, setResolveState] = useState<AttachResolveState>("idle");

  // Ordered by relevance: projects in the open project's language first, then
  // your own, then the rest. The default view (no query) shows only the first
  // two tiers — same language + yours — keeping the whole catalog behind a
  // search.
  const catalogRepos = useMemo(() => {
    const all = catalog.repos ?? [];
    const query = catalogQuery.trim().toLowerCase();
    const me = (sessionUsername ?? "").toLowerCase();
    // Match on the BCP-47 primary subtag: a project's code carries
    // private-use/region subtags (e.g. `nya-x-ny`) the catalog's
    // `language_ietf` (e.g. `nya`) doesn't, so an exact compare misses.
    const lang = primaryLanguageSubtag(currentLanguageCode);

    const tierOf = (repo: ConsolidatedRepo) => {
      if (lang && primaryLanguageSubtag(repo.language_ietf) === lang) {
        return 0;
      }
      if (me && repo.username.toLowerCase() === me) return 1;
      return 2;
    };
    const byRelevance = (a: ConsolidatedRepo, b: ConsolidatedRepo) => {
      const tierDelta = tierOf(a) - tierOf(b);
      if (tierDelta !== 0) return tierDelta;
      return `${a.language_english_name} ${a.repo_name}`.localeCompare(
        `${b.language_english_name} ${b.repo_name}`,
      );
    };

    if (!query) {
      return all.filter((repo) => tierOf(repo) <= 1).sort(byRelevance);
    }
    return all
      .filter((repo) =>
        `${repo.title ?? ""} ${repo.repo_name} ${repo.username} ${repo.language_english_name} ${repo.language_name}`
          .toLowerCase()
          .includes(query),
      )
      .sort(byRelevance);
  }, [catalog.repos, catalogQuery, sessionUsername, currentLanguageCode]);

  // parseWacsRepoUrl only matches the configured host, so ordinary search
  // text falls through to the catalog filter above.
  const pastedTarget = useMemo(
    () =>
      giteaHostBaseUrl
        ? parseWacsRepoUrl(giteaHostBaseUrl, catalogQuery)
        : null,
    [giteaHostBaseUrl, catalogQuery],
  );
  const linkTargetLabel = pastedTarget
    ? `${pastedTarget.owner}/${pastedTarget.repo}`
    : null;

  // What we're attaching to: a pasted link wins over a catalog pick. One
  // resolver keyed off this single target keeps the two paths from racing on
  // resolveState.
  const activeTarget = useMemo(() => {
    if (pastedTarget) {
      return {
        owner: pastedTarget.owner,
        name: pastedTarget.repo,
        debounceMs: 350,
      };
    }
    if (selectedRepo) {
      return {
        owner: selectedRepo.username,
        name: selectedRepo.repo_name,
        debounceMs: 0,
      };
    }
    return null;
  }, [pastedTarget, selectedRepo]);

  useEffect(() => {
    if (!activeTarget) {
      setResolvedRepo(null);
      setResolveState("idle");
      return;
    }
    const controller = new AbortController();
    setResolvedRepo(null);
    setResolveState("resolving");
    const handle = setTimeout(() => {
      projectsService
        .getRemoteRepo({
          owner: activeTarget.owner,
          name: activeTarget.name,
          signal: controller.signal,
        })
        .then((summary) => {
          if (controller.signal.aborted) return;
          if (!summary) {
            if (import.meta.env.DEV) {
              console.warn(
                "[sharedProjectPicker] couldn't open project — getRemoteRepo returned no repo",
                {
                  owner: activeTarget.owner,
                  name: activeTarget.name,
                },
              );
            }
            setResolveState("error");
            return;
          }
          setResolvedRepo(summary);
          // No edit access → offer a fork (which tags the copy as a
          // shared project). Writable but not a shared project →
          // can't attach (a pasted link can reach one; the catalog,
          // built from shared projects, won't). Writable + shared →
          // attachable.
          if (!summary.canWrite) {
            setResolveState("not-writable");
          } else if (!summary.topics.includes(GIT_REMOTE_DEFAULT_TOPIC)) {
            setResolveState("not-shared");
          } else {
            setResolveState("writable");
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (import.meta.env.DEV) {
            console.warn(
              "[sharedProjectPicker] couldn't open project — getRemoteRepo threw",
              {
                owner: activeTarget.owner,
                name: activeTarget.name,
                error,
              },
            );
          }
          setResolveState("error");
        });
    }, activeTarget.debounceMs);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [activeTarget, projectsService]);

  return {
    catalogRepos,
    catalogQuery,
    setCatalogQuery,
    isCatalogLoading: catalog.isLoading,
    isCatalogError: catalog.isError,
    catalogErrorMessage: catalog.errorMessage,
    selectedRepo,
    setSelectedRepo,
    resolveState,
    resolvedRepo,
    linkTargetLabel,
  };
}
