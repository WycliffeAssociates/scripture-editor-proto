import * as v from "valibot";

/**
 * Verify a pasted WACS (gitea) repository link before offering to import it.
 *
 * The public data API is the primary discovery path, but it can lag behind the
 * gitea host. When someone pastes a repo URL that the catalog hasn't ingested
 * yet, we go straight to the gitea instance: confirm the repo exists, is public,
 * and carries the `consolidated` topic (the same topic the catalog is built
 * from) before turning it into an importable archive URL.
 *
 * This is intentionally a plain, auth-free helper — only public repos are
 * supported here, matching the no-cloud-login onboarding flow.
 */

/** Repos must carry this gitea topic to be importable (mirrors the catalog). */
const CONSOLIDATED_TOPIC = "consolidated";

const RepoSchema = v.object({
  default_branch: v.optional(v.string()),
});

const TopicsSchema = v.object({
  topics: v.nullish(v.array(v.string())),
});

export type WacsRepoTarget = {
  owner: string;
  repo: string;
};

export type WacsRepoProbeResult =
  | { kind: "importable"; owner: string; repo: string; archiveUrl: string }
  | { kind: "not-consolidated"; owner: string; repo: string }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

/**
 * Parse a pasted string into an owner/repo pair when (and only when) it is a URL
 * under the configured gitea host. Returns null for anything else so the caller
 * can fall back to normal catalog search.
 */
export function parseWacsRepoUrl(
  hostBaseUrl: string,
  raw: string,
): WacsRepoTarget | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let host: URL;
  let parsed: URL;
  try {
    host = new URL(hostBaseUrl);
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.origin !== host.origin) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const owner = decodeURIComponent(segments[0]);
  const repo = decodeURIComponent(segments[1]).replace(/\.git$/u, "");
  if (!owner || !repo) return null;

  return { owner, repo };
}

/**
 * Probe the gitea host for a pasted repo: existence + the `consolidated` topic,
 * resolving to an archive URL the normal import path can download.
 */
export async function probeWacsRepo(args: {
  hostBaseUrl: string;
  target: WacsRepoTarget;
  signal?: AbortSignal;
}): Promise<WacsRepoProbeResult> {
  const { hostBaseUrl, target, signal } = args;
  const { owner, repo } = target;
  const ownerPath = encodeURIComponent(owner);
  const repoPath = encodeURIComponent(repo);

  try {
    const repoResponse = await fetch(
      new URL(`/api/v1/repos/${ownerPath}/${repoPath}`, hostBaseUrl),
      { signal },
    );
    if (repoResponse.status === 404) return { kind: "not-found" };
    if (!repoResponse.ok) {
      return {
        kind: "error",
        message: `Gitea responded with ${repoResponse.status}`,
      };
    }

    const repoData = v.parse(RepoSchema, await repoResponse.json());
    const branch = repoData.default_branch || "master";

    const topicsResponse = await fetch(
      new URL(`/api/v1/repos/${ownerPath}/${repoPath}/topics`, hostBaseUrl),
      { signal },
    );
    const topics = topicsResponse.ok
      ? (v.parse(TopicsSchema, await topicsResponse.json()).topics ?? [])
      : [];

    if (!topics.includes(CONSOLIDATED_TOPIC)) {
      return { kind: "not-consolidated", owner, repo };
    }

    const archiveUrl = new URL(
      `/${owner}/${repo}/archive/${branch}.zip`,
      hostBaseUrl,
    ).toString();
    return { kind: "importable", owner, repo, archiveUrl };
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      return { kind: "error", message: "aborted" };
    }
    return {
      kind: "error",
      message:
        cause instanceof Error
          ? cause.message
          : "Could not reach the repository host",
    };
  }
}
