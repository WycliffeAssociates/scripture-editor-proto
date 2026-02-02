import { Code, Eye, EyeOff } from "lucide-react";
import React from "react";
import type { EditorAction } from "./types.ts";

export const MODE_ACTIONS: EditorAction[] = [
    {
        id: "switch-regular",
        label: "Regular Mode",
        category: "Modes",
        icon: React.createElement(EyeOff, { size: 16 }),
        isVisible: (context) => context.editorMode !== "regular",
        execute: (_editor, context) => {
            context.actions.setEditorMode?.("regular");
            return undefined;
        },
    },
    {
        id: "switch-usfm",
        label: "USFM Mode",
        category: "Modes",
        icon: React.createElement(Eye, { size: 16 }),
        isVisible: (context) => context.editorMode !== "usfm",
        execute: (_editor, context) => {
            context.actions.setEditorMode?.("usfm");
            return undefined;
        },
    },
    {
        id: "switch-plain",
        label: "Plain Mode",
        category: "Modes",
        icon: React.createElement(Code, { size: 16 }),
        isVisible: (context) => context.editorMode !== "plain",
        execute: (_editor, context) => {
            context.actions.setEditorMode?.("plain");
            return undefined;
        },
    },
];
