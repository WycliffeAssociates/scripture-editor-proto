import { Moon, Sun } from "lucide-react";
import React from "react";
import type { EditorAction } from "./types.ts";

export const THEME_ACTIONS: EditorAction[] = [
    {
        id: "set-light-theme",
        label: (context) =>
            context.colorScheme === "light"
                ? "Light Theme (Current)"
                : "Light Theme",
        category: "Display",
        icon: React.createElement(Sun, { size: 16 }),
        isVisible: () => true,
        isDisabled: (context) => context.colorScheme === "light",
        execute: (_editor, context) => {
            context.actions.setColorScheme?.("light");
            return undefined;
        },
    },
    {
        id: "set-dark-theme",
        label: (context) =>
            context.colorScheme === "dark"
                ? "Dark Theme (Current)"
                : "Dark Theme",
        category: "Display",
        icon: React.createElement(Moon, { size: 16 }),
        isVisible: () => true,
        isDisabled: (context) => context.colorScheme === "dark",
        execute: (_editor, context) => {
            context.actions.setColorScheme?.("dark");
            return undefined;
        },
    },
];
