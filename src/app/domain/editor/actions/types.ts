import type {
    BaseSelection,
    LexicalEditor,
    NodeSelection,
    RangeSelection,
} from "lexical";
import type { ReactNode } from "react";

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
    mode: string;
    markersViewState: string;
    markersMutableState: string;
    actions: any; // Workspace actions
    searchApi: any; // Search API
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
    execute: (
        editor: LexicalEditor,
        context: EditorContext,
    ) => void | ActionStep;
}
