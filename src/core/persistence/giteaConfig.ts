/**
 * Normalize the configured Gitea host for this build.
 *
 * The cloud feature currently targets one deployment host at a time. Keeping the
 * normalization logic shared prevents web and desktop bootstrap from drifting on
 * trailing slashes or empty-string handling.
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
