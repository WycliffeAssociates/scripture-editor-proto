import { BookOpen, FileStack, Wand2 } from "lucide-react";
import React from "react";
import type { EditorAction } from "./types.ts";

function scheduleOutsideLexicalUpdate(fn: () => void) {
    // ActionPalette executes actions inside `editor.update(...)`.
    // These formatting actions can call `editor.setEditorState(...)` via hook orchestration,
    // which must not run inside an existing Lexical update.
    setTimeout(fn, 0);
}

const PRETTIFY_CHAPTER_ACTION: EditorAction = {
    id: "prettify-chapter",
    label: "Format Chapter",
    category: "Formatting",
    icon: React.createElement(BookOpen, { size: 16 }),
    isVisible: () => true,
    execute: (_editor, context) => {
        scheduleOutsideLexicalUpdate(() => {
            void context.actions.prettifyChapter();
        });
        return undefined;
    },
};

const PRETTIFY_BOOK_ACTION: EditorAction = {
    id: "prettify-book",
    label: "Format Book",
    category: "Formatting",
    icon: React.createElement(Wand2, { size: 16 }),
    isVisible: () => true,
    execute: (_editor, context) => {
        scheduleOutsideLexicalUpdate(() => {
            void context.actions.prettifyBook();
        });
        return undefined;
    },
};

const PRETTIFY_PROJECT_ACTION: EditorAction = {
    id: "prettify-project",
    label: "Format Project",
    category: "Formatting",
    icon: React.createElement(FileStack, { size: 16 }),
    isVisible: () => true,
    execute: (_editor, context) => {
        scheduleOutsideLexicalUpdate(() => {
            void context.actions.prettifyProject();
        });
        return undefined;
    },
};

export const PRETTIFY_ACTIONS: EditorAction[] = [
    PRETTIFY_CHAPTER_ACTION,
    PRETTIFY_BOOK_ACTION,
    PRETTIFY_PROJECT_ACTION,
];
