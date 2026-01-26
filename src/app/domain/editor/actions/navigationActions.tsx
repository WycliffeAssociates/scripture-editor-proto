import { BookIcon } from "lucide-react";
import type { EditorAction } from "./types.ts";

export const NAVIGATION_ACTIONS: EditorAction[] = [
    {
        id: "go-to-reference",
        label: "Go to...",
        category: "Navigation",
        icon: <BookIcon size={18} />,
        isVisible: () => true,
        execute: (_editor, context) => {
            return {
                id: "go-to-reference-input",
                label: "Go to reference",
                placeholder: "e.g. Mat 9, 1Co 1:1",
                type: "input",
                onComplete: (value) => {
                    context.actions.goToReference(value);
                },
            };
        },
    },
];
