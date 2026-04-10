/**
 * Storage-path helpers shared across web OPFS and desktop/Tauri backends.
 *
 * These normalize the app's managed-path conventions so higher layers can treat
 * paths consistently without caring which platform filesystem is underneath.
 */
export function normalizeStoragePath(path: string): string {
    const normalized = (path || "/").replace(/\\/gu, "/").replace(/\/+/gu, "/");

    if (/^[A-Za-z]:$/u.test(normalized)) {
        return `${normalized}/`;
    }

    if (/^[A-Za-z]:\//u.test(normalized)) {
        return normalized;
    }

    return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function joinStoragePath(...parts: string[]): string {
    if (parts.length === 0) return "/";
    const [first = "/", ...rest] = parts;
    let joined = first;
    for (const part of rest) {
        if (!part) continue;
        joined = `${joined.replace(/[\\/]+$/u, "")}/${part.replace(/^[\\/]+/u, "")}`;
    }
    return normalizeStoragePath(joined);
}

export function basenameStoragePath(path: string): string {
    const normalized = normalizeStoragePath(path);
    const parts = normalized.split("/").filter(Boolean);
    return parts.at(-1) ?? "";
}

export function dirnameStoragePath(path: string): string {
    const normalized = normalizeStoragePath(path).replace(/\/+$/u, "");
    if (normalized === "") return "/";
    if (/^[A-Za-z]:$/u.test(normalized)) {
        return `${normalized}/`;
    }

    const cutIndex = normalized.lastIndexOf("/");
    if (cutIndex < 0) return "/";

    const parent = normalized.slice(0, cutIndex);
    if (parent === "") return "/";
    if (/^[A-Za-z]:$/u.test(parent)) {
        return `${parent}/`;
    }
    return parent;
}

export function stripFileExtension(name: string): string {
    const lastDot = name.lastIndexOf(".");
    if (lastDot <= 0) return name;
    return name.slice(0, lastDot);
}
