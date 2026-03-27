import type { LanguageDirection } from "@/core/domain/project/project.ts";
import type {
    ContainerFormat,
    LibraryItemCapabilities,
} from "@/core/library/LibraryItemCapabilities.ts";
import type { ScriptureWorkspace } from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Shared item metadata common to all loaded library nouns.
 */
export type LibraryItemBase = {
    id: string;
    displayName: string;
    managedPath: string;
    containerFormat: ContainerFormat;
    language: {
        code: string;
        name: string;
        direction: LanguageDirection;
    };
    capabilities: LibraryItemCapabilities;
};

/**
 * The editable scripture noun returned by loaders for USFM-based workspaces.
 *
 * UI that narrows to `type === "usfmScripture"` can call these scripture verbs
 * directly instead of branching through a generic content interface.
 */
export type UsfmScriptureItem = ScriptureWorkspace &
    LibraryItemBase & {
        type: "usfmScripture";
        readWorkspace(): Promise<ScriptureWorkspaceSnapshot>;
        readBook(bookCode: string): Promise<ScriptureBook | null>;
    };

export type ScriptureWorkspaceSnapshot = {
    bookCode: string;
    usfmContents: string;
};

export type ScriptureBook = {
    bookCode: string;
    usfmContents: string;
};
