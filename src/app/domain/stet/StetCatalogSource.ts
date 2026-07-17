import {
  parseStetCatalog,
  type StetCatalog,
  StetCatalogError,
  type StetGuideManifest,
  type StetGuideRef,
} from "./stetCatalog.ts";

// Delivery boundary for STET catalogs. The seam is list + fetch so the source
// can swap from bundled `/public` JSON to a remote guides API later in one place
// (the future remote impl returns the latest provenanceId per guide and refetches
// stale cached copies). Neither call fetches or unzips a GL archive — verse text
// and gloss ranges are already baked into the envelope by the generator.

export interface StetCatalogSource {
  /** List available guides without downloading them. */
  listGuides(signal: AbortSignal): Promise<StetGuideRef[]>;
  /** Fetch + validate one guide's envelope. Unchanged across public→remote. */
  loadCatalog(ref: StetGuideRef, signal: AbortSignal): Promise<StetCatalog>;
}

const PUBLIC_STET_ROOT = "/stet";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `/public` implementation: reads the committed `index.json` manifest and
 * per-locale catalog files served under `/stet`. The only code that knows URLs.
 */
export class PublicStetCatalogSource implements StetCatalogSource {
  constructor(private readonly root: string = PUBLIC_STET_ROOT) {}

  async listGuides(signal: AbortSignal): Promise<StetGuideRef[]> {
    const response = await fetch(`${this.root}/index.json`, { signal });
    if (!response.ok) {
      throw new StetCatalogError(
        `failed to load STET manifest (${response.status})`,
      );
    }
    const raw: unknown = await response.json();
    if (
      !isRecord(raw) ||
      raw.schemaVersion !== 1 ||
      !Array.isArray(raw.guides)
    ) {
      throw new StetCatalogError("invalid STET manifest");
    }
    const guides = raw.guides as StetGuideManifest["guides"];
    return guides
      .filter(
        (guide) =>
          typeof guide?.locale === "string" &&
          typeof guide?.displayName === "string" &&
          typeof guide?.provenanceId === "string" &&
          typeof guide?.file === "string",
      )
      .map((guide) => ({
        locale: guide.locale,
        displayName: guide.displayName,
        provenanceId: guide.provenanceId,
        url: `${this.root}/${guide.file}`,
      }));
  }

  async loadCatalog(
    ref: StetGuideRef,
    signal: AbortSignal,
  ): Promise<StetCatalog> {
    const response = await fetch(ref.url, { signal });
    if (!response.ok) {
      throw new StetCatalogError(
        `failed to load STET catalog ${ref.locale} (${response.status})`,
      );
    }
    const raw: unknown = await response.json();
    const { catalog, warnings } = parseStetCatalog(raw);
    // The manifest ref is the cache key; a loaded envelope that disagrees with
    // it means a stale/mismatched file — refuse it rather than key a wrong copy.
    if (catalog.locale !== ref.locale) {
      throw new StetCatalogError(
        `catalog locale ${catalog.locale} does not match requested ${ref.locale}`,
      );
    }
    if (catalog.reference.provenanceId !== ref.provenanceId) {
      throw new StetCatalogError(
        `catalog provenance ${catalog.reference.provenanceId} does not match manifest ${ref.provenanceId}`,
      );
    }
    if (warnings.length > 0) {
      console.warn(
        `[StetCatalogSource] ${ref.locale}: ${warnings.length} catalog warning(s)`,
        warnings.slice(0, 10),
      );
    }
    return catalog;
  }
}
