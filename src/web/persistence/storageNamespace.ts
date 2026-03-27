/**
 * Local-storage key that scopes browser managed storage to one logical app
 * namespace. This lets multiple local builds coexist without sharing OPFS roots.
 */
export const WEB_STORAGE_NAMESPACE_KEY = "dovetail.storageNamespace";

/**
 * Resolve the current web storage namespace early during bootstrap so OPFS root
 * construction and Dexie naming stay aligned.
 */
export function resolveWebStorageNamespace(): string | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const namespace = window.localStorage.getItem(
            WEB_STORAGE_NAMESPACE_KEY,
        );
        return namespace?.trim() || null;
    } catch {
        return null;
    }
}
