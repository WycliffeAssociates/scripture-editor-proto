import { FileStack, Wand2 } from "lucide-react";
import React from "react";
import type { EditorAction } from "./types.ts";

const PRETTIFY_BOOK_ACTION: EditorAction = {
    id: "prettify-book",
    label: "Prettify Book",
    category: "Formatting",
    icon: React.createElement(Wand2, { size: 16 }),
    isVisible: () => true,
    execute: (_editor, context) => {
        context.actions.prettifyBook();
        return undefined;
    },
};

const PRETTIFY_PROJECT_ACTION: EditorAction = {
    id: "prettify-project",
    label: "Prettify Project",
    category: "Formatting",
    icon: React.createElement(FileStack, { size: 16 }),
    isVisible: () => true,
    execute: (_editor, context) => {
        context.actions.prettifyProject();
        return undefined;
    },
};

export const PRETTIFY_ACTIONS: EditorAction[] = [
    PRETTIFY_BOOK_ACTION,
    PRETTIFY_PROJECT_ACTION,
];
