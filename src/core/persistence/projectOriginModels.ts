import * as v from "valibot";

import type { ImportSource } from "@/core/domain/project/import/ProjectImporter.ts";
import { normalizeStoragePath } from "@/core/persistence/pathUtils.ts";

/**
 * Durable import-provenance record ("where did this project come from").
 *
 * This is deliberately separate from `gitRemoteProjectInfo`: provenance is the
 * source a project was *imported* from, which is not the same as the remote it
 * is *currently attached* to (a project can be imported from repo A and later
 * forked/attached to B). It lives as its own app-data sidecar so it survives a
 * Dexie reindex (the index is a throwaway projection rebuilt from disk).
 *
 * `remote` carries enough to dedupe a catalog row against an already-imported
 * project. `local` records that a folder/zip was brought in with no recoverable
 * upstream — a self-describing record beats a missing one. An absent sidecar
 * means the project predates provenance; callers treat that as "unknown origin".
 */
export const PROJECT_ORIGIN_SCHEMA_VERSION = 1;

const NonEmptyStringSchema = v.pipe(v.string(), v.nonEmpty());

const ProjectOriginSchema = v.variant("kind", [
  v.object({
    schemaVersion: v.literal(PROJECT_ORIGIN_SCHEMA_VERSION),
    projectPath: NonEmptyStringSchema,
    kind: v.literal("remote"),
    url: NonEmptyStringSchema,
    owner: v.nullable(v.string()),
    name: v.nullable(v.string()),
  }),
  v.object({
    schemaVersion: v.literal(PROJECT_ORIGIN_SCHEMA_VERSION),
    projectPath: NonEmptyStringSchema,
    kind: v.literal("local"),
    source: v.picklist(["folder", "zip"]),
  }),
]);

export type ProjectOrigin = v.InferOutput<typeof ProjectOriginSchema>;

export function normalizeProjectOriginPath(projectPath: string): string {
  return normalizeStoragePath(projectPath);
}

export function parseProjectOrigin(value: unknown): ProjectOrigin {
  return v.parse(ProjectOriginSchema, value);
}

/**
 * Normalize a repo/archive URL down to a stable comparison key.
 *
 * Catalog downloads arrive as `${repo_url}/archive/<branch>.zip`; pasted links
 * and git remotes can carry a trailing slash or `.git`. Stripping those lets a
 * stored origin match a catalog row's `repo_url` regardless of which branch or
 * suffix was used at import time.
 */
export function normalizeOriginUrl(url: string): string {
  let next = url.trim().toLowerCase();
  next = next.replace(/\/archive\/[^/]+\.zip$/, "");
  next = next.replace(/\.git$/, "");
  next = next.replace(/\/+$/, "");
  return next;
}

/**
 * Derive a provenance record from the low-level import source.
 *
 * `fromGitRepo` is the only source with an upstream. Its URL is the archive URL
 * the catalog/import path resolved (`${repo_url}/archive/<branch>.zip`), so the
 * base repo URL and a generic last-two-path-segments owner/name fall straight
 * out of it — no host-specific parsing, so it works for both the public catalog
 * host and pasted gitea links. `fromPreparedDir` is a metadata-review
 * continuation of an earlier import that was already stamped, so it yields no
 * new origin.
 */
export function deriveOriginFromImportSource(
  source: ImportSource,
  projectPath: string,
): ProjectOrigin | null {
  const normalizedPath = normalizeProjectOriginPath(projectPath);
  switch (source.type) {
    case "fromGitRepo": {
      const baseUrl = normalizeOriginUrl(source.url);
      const { owner, name } = parseOwnerAndName(baseUrl);
      return {
        schemaVersion: PROJECT_ORIGIN_SCHEMA_VERSION,
        projectPath: normalizedPath,
        kind: "remote",
        url: baseUrl,
        owner,
        name,
      };
    }
    case "fromZipFile":
      return {
        schemaVersion: PROJECT_ORIGIN_SCHEMA_VERSION,
        projectPath: normalizedPath,
        kind: "local",
        source: "zip",
      };
    case "fromDir":
      return {
        schemaVersion: PROJECT_ORIGIN_SCHEMA_VERSION,
        projectPath: normalizedPath,
        kind: "local",
        source: "folder",
      };
    case "fromPreparedDir":
      return null;
  }
}

function parseOwnerAndName(baseUrl: string): {
  owner: string | null;
  name: string | null;
} {
  try {
    const segments = new URL(baseUrl).pathname
      .split("/")
      .filter((segment) => segment.length > 0);
    if (segments.length < 2) {
      return { owner: null, name: null };
    }
    return {
      owner: segments[segments.length - 2],
      name: segments[segments.length - 1],
    };
  } catch {
    return { owner: null, name: null };
  }
}
