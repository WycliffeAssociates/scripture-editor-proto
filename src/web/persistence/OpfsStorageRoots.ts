import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import { resolveWebStorageNamespace } from "@/web/persistence/storageNamespace.ts";

function joinRoot(
    base: string,
    namespace: string | null,
    leaf: string,
): string {
    const namespacedBase = namespace ? `${base}/${namespace}` : base;
    if (!leaf) {
        return namespacedBase;
    }
    if (!namespace) {
        return `${base}/${leaf}`;
    }
    return `${namespacedBase}/${leaf}`;
}

/**
 * Browser storage-root layout.
 *
 * OPFS mirrors the same managed root names used on desktop so importers, loaders,
 * indexes, and UI orchestration can stay path-based and platform-neutral. The
 * optional namespace keeps separate web app instances from trampling each other.
 */
export class OpfsStorageRoots implements StorageRoots {
    readonly appDataRoot: string;
    readonly projectsRoot: string;
    readonly tempRoot: string;
    readonly cacheRoot: string;
    readonly logsRoot: string;
    readonly databaseRoot: string;

    constructor(namespace = resolveWebStorageNamespace()) {
        this.appDataRoot = joinRoot("/appData", namespace, "");
        this.projectsRoot = joinRoot("/userData", namespace, "projects");
        this.tempRoot = joinRoot("/appData", namespace, "temp");
        this.cacheRoot = joinRoot("/appData", namespace, "cache");
        this.logsRoot = joinRoot("/appData", namespace, "logs");
        this.databaseRoot = joinRoot("/appData", namespace, "database");
    }
}
