/**
 * Identifier used by read-only reference/document browsing flows.
 *
 * This is intentionally separate from app-facing item ids. It names one file-
 * like document inside a loaded reference item.
 */
declare const referenceDocumentIdBrand: unique symbol;

export type ReferenceDocumentId = string & {
    readonly [referenceDocumentIdBrand]: true;
};

/**
 * Lightweight row for menus and browse surfaces that need to list documents
 * inside a loaded reference item.
 */
export type ReferenceDocumentReference = {
    id: ReferenceDocumentId;
    name: string;
    browsePath?: readonly string[];
};

/**
 * Fully loaded document body returned by the lower-level reference/document
 * browsing seam.
 */
export type ReferenceDocument = ReferenceDocumentReference & {
    contents: string;
};

/**
 * Normalize raw ids coming from lower-level loaders into the branded document id
 * type used by browse/read reference flows.
 */
export function createReferenceDocumentId(id: string): ReferenceDocumentId {
    return id.trim() as ReferenceDocumentId;
}

/**
 * Normalize one lightweight document reference row for menus and browse surfaces.
 */
export function createReferenceDocumentReference(
    document: ReferenceDocumentReference,
): ReferenceDocumentReference {
    return {
        ...document,
        id: createReferenceDocumentId(document.id),
        name: document.name.trim(),
        browsePath:
            document.browsePath
                ?.map((segment) => segment.trim())
                .filter(Boolean) ?? undefined,
    };
}

/**
 * Normalize a fully loaded reference document body returned by the lower-level
 * read-document seam.
 */
export function createReferenceDocument(
    document: ReferenceDocument,
): ReferenceDocument {
    return {
        ...createReferenceDocumentReference(document),
        contents: document.contents,
    };
}
