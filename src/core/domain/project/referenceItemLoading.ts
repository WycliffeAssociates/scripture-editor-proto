import { removeLeadingDirSlashes } from "@/core/data/utils/generic.ts";
import type { IndexedLibraryItemType } from "@/core/library/LibraryItemType.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import {
    createReferenceDocumentId,
    createReferenceDocumentReference,
    type ReferenceDocumentReference,
} from "@/core/library/ReferenceDocuments.ts";
import type {
    RemoteSourceMetadata,
    RemoteSyncCapable,
} from "@/core/library/ReferenceItemSupport.ts";

/**
 * Build the breadcrumb-like path segments used by browse UIs from a document's
 * storage-relative path.
 */
function createBrowsePath(relativePath: string): string[] | undefined {
    const normalizedPath = removeLeadingDirSlashes(relativePath);
    const segments = normalizedPath.split("/").filter(Boolean);
    if (segments.length === 0) return undefined;

    const leaf = segments.pop();
    if (!leaf) return undefined;

    return [...segments, leaf.replace(/\.[^.]+$/u, "")].filter(Boolean);
}

/**
 * Convert a discovered file inside a loaded item into the reference shape used
 * by document pickers and read-only browsing surfaces.
 */
export function toReferenceDocumentReference(args: {
    relativePath: string;
    name: string;
}): ReferenceDocumentReference {
    return createReferenceDocumentReference({
        id: createReferenceDocumentId(args.relativePath),
        name: args.name,
        browsePath: createBrowsePath(args.relativePath),
    });
}

function normalizeMetadataToken(value?: string): string {
    return value?.trim().toLowerCase() ?? "";
}

function isScriptureFormat(format?: string): boolean {
    return normalizeMetadataToken(format).includes("usfm");
}

function isBibleSubject(subject?: string): boolean {
    return normalizeMetadataToken(subject) === "bible";
}

function isTranslationNotesMetadata(
    ...candidates: Array<string | undefined>
): boolean {
    const normalized = candidates
        .map(normalizeMetadataToken)
        .filter(Boolean)
        .join(" ");
    return (
        /\btranslation notes\b/u.test(normalized) ||
        normalized.includes("_tn") ||
        normalized === "tn" ||
        normalized.endsWith(" tn")
    );
}

function isTranslationWordsMetadata(
    ...candidates: Array<string | undefined>
): boolean {
    const normalized = candidates
        .map(normalizeMetadataToken)
        .filter(Boolean)
        .join(" ");
    return (
        /\btranslation words\b/u.test(normalized) ||
        normalized.includes("_tw") ||
        normalized === "tw" ||
        normalized.endsWith(" tw")
    );
}

/**
 * Resolve the app-facing item type from RC metadata so import and load phases
 * make the same decision from the same manifest fields.
 */
export function classifyResourceKindFromResourceContainer(args: {
    identifier?: string;
    title?: string;
    subject?: string;
    format?: string;
}): IndexedLibraryItemType {
    if (isScriptureFormat(args.format) && isBibleSubject(args.subject)) {
        return "usfmScripture";
    }

    if (isTranslationNotesMetadata(args.identifier, args.title, args.subject)) {
        return "translationNotes";
    }

    if (isTranslationWordsMetadata(args.identifier, args.title, args.subject)) {
        return "translationWords";
    }

    return "unknown";
}

/**
 * Resolve the app-facing item type from Burrito metadata. Burrito stores the
 * same meaning in different fields than RC, so the heuristics live here rather
 * than being repeated in each loader/importer.
 */
export function classifyResourceKindFromScriptureBurrito(args: {
    abbreviation?: string;
    name?: string;
    subject?: string;
    flavorTypeName?: string;
}): IndexedLibraryItemType {
    if (normalizeMetadataToken(args.flavorTypeName) === "scripture") {
        return "usfmScripture";
    }

    if (
        isTranslationNotesMetadata(args.abbreviation, args.name, args.subject)
    ) {
        return "translationNotes";
    }

    if (
        isTranslationWordsMetadata(args.abbreviation, args.name, args.subject)
    ) {
        return "translationWords";
    }

    return "unknown";
}

export type SourceEntry = {
    identifier: string;
    language?: string;
    version?: string;
};

/**
 * Infer the transport we would need later if the app offers update checks for a
 * loaded item that advertises a remote source.
 */
function inferRemoteSourceKind(
    identifier: string,
): RemoteSourceMetadata["kind"] {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    if (
        normalizedIdentifier.startsWith("git@") ||
        normalizedIdentifier.endsWith(".git")
    ) {
        return "git";
    }

    if (
        normalizedIdentifier.startsWith("http://") ||
        normalizedIdentifier.startsWith("https://")
    ) {
        return "url";
    }

    return "unknown";
}

/**
 * Normalize raw container source metadata into the smaller remote-source shape
 * used by loaded-item capabilities.
 */
export function createRemoteSourceMetadata(
    source: SourceEntry,
): RemoteSourceMetadata {
    return {
        kind: inferRemoteSourceKind(source.identifier),
        identifier: source.identifier.trim(),
        ref: source.version?.trim() || undefined,
        shallowClone: true,
    };
}

/**
 * Produce a minimal remote-sync capability for resources that advertise an
 * origin but are not wired to a richer sync strategy at this seam.
 */
function createRemoteSyncCapability(
    remoteSource: RemoteSourceMetadata,
): RemoteSyncCapable {
    return {
        remoteSource,
        checkForUpdates: async () => ({
            hasUpdates: false,
            remoteRevision: remoteSource.ref,
        }),
        applyUpdates: async () => {},
    };
}

/**
 * Attach the remote-sync affordance without changing the underlying loaded
 * resource identity.
 */
export function attachRemoteSyncCapability<T extends LoadedReferenceItem>(
    resource: T,
    remoteSource: RemoteSourceMetadata,
): T & RemoteSyncCapable {
    return {
        ...resource,
        ...createRemoteSyncCapability(remoteSource),
    };
}
