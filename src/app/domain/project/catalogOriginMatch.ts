import type { ConsolidatedRepo } from "@/core/domain/project/import/LanguageApiImporter.ts";
import {
  normalizeOriginUrl,
  type ProjectOrigin,
} from "@/core/persistence/projectOriginModels.ts";

/**
 * Catalog username whose repos are the curated WA-Catalog reference texts.
 *
 * The reference panel only surfaces this owner; other repos stay on the main
 * import page. The public data API reports the owner lowercased.
 */
export const WA_CATALOG_USERNAME = "wa-catalog";

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Keep only the curated WA-Catalog rows from a consolidated-catalog result. */
export function selectWaCatalogRepos(
  repos: ConsolidatedRepo[],
): ConsolidatedRepo[] {
  return repos.filter((repo) =>
    equalsIgnoreCase(repo.username, WA_CATALOG_USERNAME),
  );
}

/**
 * Decide whether an on-device project's recorded provenance is the same upstream
 * as a catalog row — i.e. "we already have this".
 *
 * Prefer the normalized base repo URL (both the stored origin and the catalog
 * row derive from the same `repo_url`, so this is exact for catalog downloads).
 * Fall back to owner/name for pasted-link imports whose stored URL host differs
 * from the catalog's. Local (folder/zip) origins never match — they have no
 * recoverable upstream.
 */
export function originMatchesCatalogRepo(
  origin: ProjectOrigin,
  repo: ConsolidatedRepo,
): boolean {
  if (origin.kind !== "remote") return false;
  if (normalizeOriginUrl(origin.url) === normalizeOriginUrl(repo.repo_url)) {
    return true;
  }
  return Boolean(
    origin.owner &&
    origin.name &&
    equalsIgnoreCase(origin.owner, repo.username) &&
    equalsIgnoreCase(origin.name, repo.repo_name),
  );
}

/**
 * True when any of the supplied origins already covers this catalog row.
 */
export function catalogRepoAlreadyImported(
  repo: ConsolidatedRepo,
  origins: Iterable<ProjectOrigin>,
): boolean {
  for (const origin of origins) {
    if (originMatchesCatalogRepo(origin, repo)) return true;
  }
  return false;
}
