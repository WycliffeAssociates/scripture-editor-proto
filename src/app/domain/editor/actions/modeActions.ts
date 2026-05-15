import { Code, Eye, EyeOff, FormInput } from "lucide-react";
import React from "react";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import type { EditorAction } from "./types.ts";

/**
 * Palette commands for switching how the current scripture chapter is rendered
 * and edited.
 *
 * These actions do not load different data; they rematerialize the same
 * scripture workspace into a different editor presentation.
 */
export const MODE_ACTIONS: EditorAction[] = [
    {
        id: "switch-plain",
        label: (context) =>
            context.editorMode === EDITOR_MODES.plain
                ? "Plain Mode (Current)"
                : "Plain Mode",
        category: "Modes",
        icon: React.createElement(Code, { size: 16 }),
        isVisible: () => true,
        isDisabled: (context) => context.editorMode === EDITOR_MODES.plain,
        execute: (_editor, context) => {
            if (context.editorMode === EDITOR_MODES.plain) return undefined;
            context.actions.setEditorMode?.(EDITOR_MODES.plain);
            return undefined;
        },
    },
    {
        id: "switch-regular",
        label: (context) =>
            context.editorMode === EDITOR_MODES.regular
                ? "Regular Mode (Current)"
                : "Regular Mode",
        category: "Modes",
        icon: React.createElement(EyeOff, { size: 16 }),
        isVisible: () => true,
        isDisabled: (context) => context.editorMode === EDITOR_MODES.regular,
        execute: (_editor, context) => {
            if (context.editorMode === EDITOR_MODES.regular) return undefined;
            context.actions.setEditorMode?.(EDITOR_MODES.regular);
            return undefined;
        },
    },
    {
        id: "switch-view",
        label: (context) =>
            context.editorMode === EDITOR_MODES.view
                ? "View Mode (Current)"
                : "View Mode",
        category: "Modes",
        icon: React.createElement(Eye, { size: 16 }),
        isVisible: () => true,
        isDisabled: (context) => context.editorMode === EDITOR_MODES.view,
        execute: (_editor, context) => {
            if (context.editorMode === EDITOR_MODES.view) return undefined;
            context.actions.setEditorMode?.(EDITOR_MODES.view);
            return undefined;
        },
    },
    {
        id: "switch-usfm",
        label: (context) =>
            context.editorMode === EDITOR_MODES.usfm
                ? "USFM Mode (Current)"
                : "USFM Mode",
        category: "Modes",
        icon: React.createElement(Eye, { size: 16 }),
        isVisible: () => true,
        isDisabled: (context) => context.editorMode === EDITOR_MODES.usfm,
        execute: (_editor, context) => {
            if (context.editorMode === EDITOR_MODES.usfm) return undefined;
            context.actions.setEditorMode?.(EDITOR_MODES.usfm);
            return undefined;
        },
    },
    {
        id: "switch-form",
        // todo: not only this one, but this whole actionPallete isn't localized like should be
        label: (context) =>
            context.editorMode === EDITOR_MODES.form
                ? "Form Mode (Current)"
                : "Form Mode",
        category: "Modes",
        icon: React.createElement(FormInput, { size: 16 }),
        isVisible: () => true,
        isDisabled: (context) => context.editorMode === EDITOR_MODES.form,
        execute: (_editor, context) => {
            if (context.editorMode === EDITOR_MODES.form) return undefined;
            context.actions.setEditorMode?.(EDITOR_MODES.form);
            return undefined;
        },
    },
];
