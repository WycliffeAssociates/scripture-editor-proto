import type { LanguageDirection } from "@/core/domain/project/project.ts";
import type { ContainerFormat } from "@/core/library/LibraryItemCapabilities.ts";
import type { IndexedLibraryItemType } from "@/core/library/LibraryItemType.ts";
import type {
    ReferenceDocument,
    ReferenceDocumentId,
    ReferenceDocumentReference,
} from "@/core/library/ReferenceDocuments.ts";
import type { RemoteSyncCapable } from "@/core/library/ReferenceItemSupport.ts";
import type { PackedTranslationNotesReadable } from "@/core/library/stores/PackedTranslationNotesRepository.ts";
import type { ProjectType } from "@/core/persistence/ScriptureWorkspace.ts";

export type ReferenceItemDescriptor = {
    id: string;
    displayName: string;
    type: IndexedLibraryItemType;
    containerFormat: ContainerFormat;
    language: {
        code: string;
        name: string;
        direction: LanguageDirection;
    };
    readOnly: boolean;
};

/**
 * Lower-level read-only/document-browsing shape returned by container loaders.
 *
 * `ItemLoader` converts this lower-level shape into typed app nouns. A few
 * flows such as generic document browsing and TN repack/update plumbing still
 * need the document-level surface directly.
 */
export interface LoadedReferenceItem
    extends Partial<RemoteSyncCapable>,
        Partial<PackedTranslationNotesReadable> {
    readonly folderName: string;
    readonly displayName: string;
    readonly managedPath: string;
    readonly projectId?: string;
    readonly projectType?: ProjectType;
    readonly descriptor: ReferenceItemDescriptor;

    listDocuments(): Promise<ReferenceDocumentReference[]>;
    readDocument(
        documentId: ReferenceDocumentId | string,
    ): Promise<ReferenceDocument>;
}
