import * as v from "valibot";

/**
 * Schema for the subset of the language API payload the import UI actually uses
 * to render candidate resources and turn a selection into an archive URL.
 */
const ConsolidatedRepoSchema = v.object({
    language_ietf: v.string(),
    language_name: v.string(),
    repo_url: v.string(),
    title: v.nullish(v.string()),
    language_english_name: v.string(),
    repo_name: v.string(),
    username: v.string(),
});

const ConsolidatedReposResponseSchema = v.object({
    vw_consolidated_repos: v.array(ConsolidatedRepoSchema),
});

export interface ConsolidatedRepo {
    language_ietf: string;
    language_name: string;
    repo_url: string;
    title?: string | null | undefined;
    language_english_name: string;
    repo_name: string;
    username: string;
}

/**
 * Discover remote resources that can be imported through the create/import UI.
 *
 * This is source discovery, not the import pipeline itself. The chosen repo
 * still becomes a zip URL that later flows through the normal archive import
 * path.
 */
export async function fetchConsolidatedRepos(): Promise<ConsolidatedRepo[]> {
    // TODO: remove this default URL when the environment variable is set
    const DEFAULT_LANGUAGE_API_URL =
        "https://api.bibleineverylanguage.org/api/rest/consolidated-repos";

    const url =
        import.meta.env.VITE_LANGUAGE_API_URL ?? DEFAULT_LANGUAGE_API_URL;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Language API error: ${response.status}`);
    }

    const data = await response.json();
    return v.parse(ConsolidatedReposResponseSchema, data).vw_consolidated_repos;
}

/**
 * Produce a user-facing label for one repo entry while disambiguating duplicate
 * titles that appear in the same UI group.
 */
export function formatRepoDisplay(
    repo: ConsolidatedRepo,
    reposInGroup: ConsolidatedRepo[],
): string {
    if (!repo.title) {
        return `${repo.username}/${repo.repo_name}`;
    }

    // Check for title conflicts within the group
    const titleMatches = reposInGroup.filter((r) => r.title === repo.title);
    const hasConflict = titleMatches.length > 1;

    if (hasConflict) {
        return `${repo.title} (${repo.username}/${repo.repo_name})`;
    } else {
        return repo.title;
    }
}

/**
 * Probe common default branches and return a direct archive URL the import
 * pipeline can download.
 */
export async function getZipUrl(repo: ConsolidatedRepo): Promise<string> {
    const branches = ["master", "main"];

    for (const branch of branches) {
        const zipUrl = `${repo.repo_url}/archive/${branch}.zip`;
        try {
            const response = await fetch(zipUrl, { method: "HEAD" });
            if (response.ok) return zipUrl;
        } catch (error) {
            console.error("Error checking zip URL:", error);
            // Try next branch
        }
    }

    throw new Error(`Unable to find archive for ${repo.repo_url}`);
}
