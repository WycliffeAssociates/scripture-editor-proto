import { Code, Eye, EyeOff } from "lucide-react";
import React from "react";
import {
    EditorMarkersMutableStates,
    EditorMarkersViewStates,
    EditorModes,
} from "@/app/data/editor.ts";
import type { EditorAction } from "./types.ts";

export const MODE_ACTIONS: EditorAction[] = [
    {
        id: "switch-regular",
        label: "Regular Mode",
        category: "Modes",
        icon: React.createElement(EyeOff, { size: 16 }),
        isVisible: (context) => {
            return !(
                context.mode === EditorModes.WYSIWYG &&
                context.markersViewState === EditorMarkersViewStates.NEVER &&
                context.markersMutableState ===
                    EditorMarkersMutableStates.IMMUTABLE
            );
        },
        execute: (_editor, context) => {
            if (context.actions.adjustWysiwygMode) {
                context.actions.adjustWysiwygMode({
                    markersViewState: EditorMarkersViewStates.NEVER,
                    markersMutableState: EditorMarkersMutableStates.IMMUTABLE,
                });
            }
        },
    },
    {
        id: "switch-usfm",
        label: "USFM Mode",
        category: "Modes",
        icon: React.createElement(Eye, { size: 16 }),
        isVisible: (context) => {
            return !(
                context.mode === EditorModes.WYSIWYG &&
                context.markersViewState === EditorMarkersViewStates.ALWAYS &&
                context.markersMutableState ===
                    EditorMarkersMutableStates.MUTABLE
            );
        },
        execute: (_editor, context) => {
            if (context.actions.adjustWysiwygMode) {
                context.actions.adjustWysiwygMode({
                    markersViewState: EditorMarkersViewStates.ALWAYS,
                    markersMutableState: EditorMarkersMutableStates.MUTABLE,
                });
            }
        },
    },
    {
        id: "switch-raw",
        label: "Raw Mode",
        category: "Modes",
        icon: React.createElement(Code, { size: 16 }),
        isVisible: (context) => context.mode !== EditorModes.SOURCE,
        execute: (_editor, context) => {
            if (context.actions.toggleToSourceMode) {
                context.actions.toggleToSourceMode();
            }
        },
    },
];
