/**
 * Normalize managed-storage paths before passing them to Tauri fs adapters.
 *
 * This helper is for the app's internal storage-path contract, not arbitrary
 * native desktop paths coming from dialogs or Rust commands.
 */
export const normalizeManagedDesktopPath = (p: string) =>
    p.replace(/\\/g, "/").replace(/\/+$/, "");

/**
 * Normalize native desktop path strings crossing the Tauri boundary before app
 * code consumes them.
 *
 * This preserves Windows drive roots like `C:/` and UNC prefixes like
 * `//server/share` while still canonicalizing separators for the shared TS
 * layers that assume slash-delimited paths.
 */
export function normalizeDesktopPath(path: string): string {
    const normalized = (path || "/").replace(/\\/g, "/");

    if (normalized.startsWith("//")) {
        return normalized.replace(/\/+$/u, "") || "//";
    }

    const trimmed = normalized.replace(/\/+$/u, "");
    if (/^[A-Za-z]:$/u.test(trimmed)) {
        return `${trimmed}/`;
    }
    return trimmed || "/";
}
// const splitPath = (p: string) =>
//     normalizeManagedDesktopPath(p).split("/").filter(Boolean);
