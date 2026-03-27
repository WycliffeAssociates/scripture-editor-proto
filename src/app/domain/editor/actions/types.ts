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
import type { LanguageDirection } from "@/core/domain/project/project.ts";

/**
 * Lexical selection variants the action palette may need to inspect.
 */
export type EditorSelection =
    | RangeSelection
    | NodeSelection
    | BaseSelection
    | null;

/**
 * Snapshot of editor/UI state passed into action visibility and execution.
 *
 * The action layer exists so command-palette items can answer "should this
 * action show up here?" and "what should it do?" without every palette item
 * reaching directly into hooks across the app.
 */
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
    languageDirection: LanguageDirection;
    colorScheme: "light" | "dark";
    actions: UseActionsHook;
    searchApi: UseSearchReturn;
}

/**
 * Optional follow-up step returned by an action that needs user input after the
 * initial command-palette choice.
 */
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

/**
 * One command-palette action.
 *
 * Actions are intentionally declarative: visibility, disabled state, and
 * execution live together so the palette can render a filtered list without
 * knowing the details of each editor operation.
 */
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
