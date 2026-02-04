import type {
    BaseSelection,
    LexicalEditor,
    NodeSelection,
    RangeSelection,
} from "lexical";
import type { ReactNode } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { UseActionsHook } from "@/app/ui/hooks/useActions.tsx";
import type { UseSearchReturn } from "@/app/ui/hooks/useSearch.tsx";

export type EditorSelection =
    | RangeSelection
    | NodeSelection
    | BaseSelection
    | null;

export interface EditorContext {
    selection: EditorSelection;
    nativeSelection: Selection | null;
    selectedText: string;
    suggestedSearchTerm: string;
    nodePath: string[]; // Array of node types or markers in the hierarchy
    currentVerse?: string;
    currentMarker?: string;
    canMakeVerseMarkerFromCursor?: boolean;
    makeVerseMarkerNumber?: string;
    editorMode: EditorModeSetting;
    languageDirection: "ltr" | "rtl";
    colorScheme: "light" | "dark";
    actions: UseActionsHook; // Workspace actions
    searchApi: UseSearchReturn; // Search API
}

export interface ActionStep {
    id: string;
    label: string;
    placeholder?: string;
    type: "input" | "select";
    options?: { label: string; value: string }[];
    onComplete: (
        value: string,
        editor: LexicalEditor,
        context: EditorContext,
    ) => void;
}

export interface EditorAction {
    id: string;
    label: string | ((context: EditorContext) => string);
    category: string;
    icon?: ReactNode;
    marker?: string; // For USFM markers
    isVisible: (context: EditorContext) => boolean;
    isDisabled?: (context: EditorContext) => boolean;
    execute: (
        editor: LexicalEditor,
        context: EditorContext,
    ) => undefined | ActionStep;
}
