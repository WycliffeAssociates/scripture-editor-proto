/**
 * Normalize a configured platform-specific Gitea host.
 *
 * Web and desktop may target different hosts. Keeping the normalization logic
 * shared prevents those bootstraps from drifting on trailing slashes or empty
 * string handling.
 */
export function normalizeGiteaHostBaseUrl(
    value: string | null | undefined,
): string | null {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    return trimmed.replace(/\/+$/u, "");
}

export function normalizeOptionalHeaderValue(
    value: string | null | undefined,
): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}
