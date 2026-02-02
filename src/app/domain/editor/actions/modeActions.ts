import { Code, Eye, EyeOff } from "lucide-react";
import React from "react";
import type { EditorAction } from "./types.ts";

export const MODE_ACTIONS: EditorAction[] = [
    {
        id: "switch-plain",
        label: (context) =>
            context.editorMode === "plain"
                ? "Plain Mode (Current)"
                : "Plain Mode",
        category: "Modes",
        icon: React.createElement(Code, { size: 16 }),
        isVisible: () => true,
        isDisabled: (context) => context.editorMode === "plain",
        execute: (_editor, context) => {
            if (context.editorMode === "plain") return undefined;
            context.actions.setEditorMode?.("plain");
            return undefined;
        },
    },
    {
        id: "switch-regular",
        label: (context) =>
            context.editorMode === "regular"
                ? "Regular Mode (Current)"
                : "Regular Mode",
        category: "Modes",
        icon: React.createElement(EyeOff, { size: 16 }),
        isVisible: () => true,
        isDisabled: (context) => context.editorMode === "regular",
        execute: (_editor, context) => {
            if (context.editorMode === "regular") return undefined;
            context.actions.setEditorMode?.("regular");
            return undefined;
        },
    },
    {
        id: "switch-usfm",
        label: (context) =>
            context.editorMode === "usfm" ? "USFM Mode (Current)" : "USFM Mode",
        category: "Modes",
        icon: React.createElement(Eye, { size: 16 }),
        isVisible: () => true,
        isDisabled: (context) => context.editorMode === "usfm",
        execute: (_editor, context) => {
            if (context.editorMode === "usfm") return undefined;
            context.actions.setEditorMode?.("usfm");
            return undefined;
        },
    },
];
