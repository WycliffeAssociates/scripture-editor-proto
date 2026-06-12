import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import {
  catalogRepoAlreadyImported,
  selectWaCatalogRepos,
} from "@/app/domain/project/catalogOriginMatch.ts";
import { useConsolidatedCatalog } from "@/app/ui/hooks/useConsolidatedCatalog.ts";
import {
  type ConsolidatedRepo,
  getZipUrl,
} from "@/core/domain/project/import/LanguageApiImporter.ts";
import type { ImportService } from "@/core/library/ImportService.ts";
import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";

/** Stable identity for a catalog row, used for busy-state and dedupe keys. */
function consolidatedRepoKey(repo: ConsolidatedRepo): string {
  return `${repo.username}/${repo.repo_name}`;
}

export type ReferenceCatalogResult = {
  /** WA-Catalog rows only; null while the catalog is loading. */
  repos: ConsolidatedRepo[] | null;
  isLoading: boolean;
  isError: boolean;
  /** True once this row's upstream is already present on disk. */
  isAlreadyImported: (repo: ConsolidatedRepo) => boolean;
  /** True while this specific row is downloading. */
  isDownloading: (repo: ConsolidatedRepo) => boolean;
  /** Quietly import a catalog row as a reference text (no toast / open prompt). */
  downloadReferenceText: (repo: ConsolidatedRepo) => void;
};

/**
 * Curated WA-Catalog side of the reference panel.
 *
 * Wraps the shared consolidated-catalog query (filtered to WA-Catalog), and
 * pairs it with the on-device projects' recorded provenance so already-imported
 * rows can be grayed out. Picking a row runs the normal remote-archive import
 * directly — no success toast, no "open project" prompt (it is reference
 * material, not the project you are editing) — then invalidates the reference
 * list so the new text appears under "On this device".
 */
export function useReferenceCatalog(args: {
  deviceResourcePaths: string[];
}): ReferenceCatalogResult {
  const { deviceResourcePaths } = args;
  const queryClient = useQueryClient();
  const { projectsService, importService } = useRouter().options.context as {
    projectsService: ProjectsService;
    importService: ImportService;
  };

  const catalog = useConsolidatedCatalog();
  const repos = useMemo(
    () => (catalog.repos ? selectWaCatalogRepos(catalog.repos) : null),
    [catalog.repos],
  );

  // Sort the paths so the query key is stable regardless of listing order.
  const originsKey = useMemo(
    () => [...deviceResourcePaths].sort(),
    [deviceResourcePaths],
  );
  const originsQuery = useQuery({
    queryKey: ["referenceResourceOrigins", originsKey],
    queryFn: async () => {
      const origins = await Promise.all(
        originsKey.map((path) => projectsService.readProjectOrigin(path)),
      );
      return origins.filter((origin) => origin !== null);
    },
    enabled: originsKey.length > 0,
  });
  const origins = useMemo(() => originsQuery.data ?? [], [originsQuery.data]);

  // Track in-flight downloads by row key so several rows can download at once
  // and each shows its own busy affordance.
  const [downloadingKeys, setDownloadingKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const isAlreadyImported = useCallback(
    (repo: ConsolidatedRepo) => catalogRepoAlreadyImported(repo, origins),
    [origins],
  );
  const isDownloading = useCallback(
    (repo: ConsolidatedRepo) => downloadingKeys.has(consolidatedRepoKey(repo)),
    [downloadingKeys],
  );
  const downloadReferenceText = useCallback(
    (repo: ConsolidatedRepo) => {
      const key = consolidatedRepoKey(repo);
      if (downloadingKeys.has(key)) return;
      setDownloadingKeys((prev) => new Set(prev).add(key));
      void (async () => {
        try {
          const zipUrl = await getZipUrl(repo);
          await importService.importRemoteZip({
            type: "fromGitRepo",
            url: zipUrl,
          });
          await queryClient.invalidateQueries({
            queryKey: ["referenceResources"],
          });
          await queryClient.invalidateQueries({
            queryKey: ["referenceResourceOrigins"],
          });
        } catch (error) {
          console.error(
            `[useReferenceCatalog] Failed to download reference text ${key}:`,
            error,
          );
        } finally {
          setDownloadingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      })();
    },
    [downloadingKeys, importService, queryClient],
  );

  return {
    repos,
    isLoading: catalog.isLoading,
    isError: catalog.isError,
    isAlreadyImported,
    isDownloading,
    downloadReferenceText,
  };
}
