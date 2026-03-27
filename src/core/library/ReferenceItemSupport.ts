import type { RemoteSyncCapabilitySource } from "@/core/library/LibraryItemCapabilities.ts";
import type { IndexedLibraryItemType } from "@/core/library/LibraryItemType.ts";
import type { ReferenceDocumentReference } from "@/core/library/ReferenceDocuments.ts";

/**
 * Scripture-addressable location used when a loaded reference item needs to
 * resolve one scripture anchor into one or more browseable documents.
 */
export type ScriptureAnchor = {
    bookCode: string;
    chapter?: number;
    verse?: number;
    verseEnd?: number;
    reference?: string;
};

export type RemoteSourceMetadata = RemoteSyncCapabilitySource;

export type RemoteSyncCheckResult = {
    hasUpdates: boolean;
    remoteRevision?: string;
    checkedAt?: string;
};

export interface ScriptureAnchorAddressable {
    resolveScriptureAnchor(
        anchor: ScriptureAnchor,
    ): Promise<readonly ReferenceDocumentReference[]>;
}

export interface RemoteSyncCapable {
    readonly remoteSource: RemoteSourceMetadata;

    checkForUpdates(): Promise<RemoteSyncCheckResult>;
    applyUpdates(): Promise<void>;
}

/**
 * Structural type guard for items that can resolve scripture anchors into
 * browseable reference documents.
 */
export function isScriptureAnchorAddressable(
    value: unknown,
): value is ScriptureAnchorAddressable {
    return (
        typeof value === "object" &&
        value !== null &&
        "resolveScriptureAnchor" in value &&
        typeof (value as { resolveScriptureAnchor?: unknown })
            .resolveScriptureAnchor === "function"
    );
}

/**
 * Structural type guard for items that expose remote update affordances.
 */
export function isRemoteSyncCapable(
    value: unknown,
): value is RemoteSyncCapable {
    return (
        typeof value === "object" &&
        value !== null &&
        "remoteSource" in value &&
        typeof (value as { remoteSource?: unknown }).remoteSource ===
            "object" &&
        (value as { remoteSource?: unknown }).remoteSource !== null &&
        "checkForUpdates" in value &&
        typeof (value as { checkForUpdates?: unknown }).checkForUpdates ===
            "function" &&
        "applyUpdates" in value &&
        typeof (value as { applyUpdates?: unknown }).applyUpdates === "function"
    );
}

/**
 * Helper for list/filter UIs that need to know which indexed item types can
 * participate in scripture-anchor-driven reference browsing.
 */
export function isReferenceTypeAnchorable(
    type: IndexedLibraryItemType,
): boolean {
    return type === "usfmScripture" || type === "translationNotes";
}
