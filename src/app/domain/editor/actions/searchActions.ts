import { Search } from "lucide-react";
import React from "react";
import type { EditorAction } from "./types.ts";

/**
 * Context-menu search affordances derived from the current editor selection.
 *
 * These actions do not perform the search themselves. They bridge the editor
 * action palette into the app-level search pane by forwarding the inferred
 * term from `useEditorContext`.
 */
export const SEARCH_ACTIONS: EditorAction[] = [
    {
        id: "find-selection",
        label: (context) => `Find "${context.suggestedSearchTerm}"`,
        category: "Search",
        icon: React.createElement(Search, { size: 16 }),
        isVisible: (context) => !!context.suggestedSearchTerm,
        execute: (_editor, context) => {
            if (context.searchApi) {
                context.searchApi.onSearchChange(context.suggestedSearchTerm);
                context.searchApi.setIsSearchPaneOpen(true);
            }
            return undefined;
        },
    },
];
