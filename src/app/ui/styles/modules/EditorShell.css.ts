import { style } from "@vanilla-extract/css";

export const editorOuter = style({
    padding: "0.5rem",
});

export const editorContainer = style({
    position: "relative",
});

export const contentEditable = style({
    outline: "none",
    width: "100%",
    padding: "0.5rem",
});

export const contentEditableSearchOpen = style({
    paddingTop: "7rem",
});
export const loadingReference = style({
    padding: "1rem",
});
export const contentEditableReference = style({
    outline: "none",
    width: "100%",
    padding: "1rem",
    backgroundColor: "var(--mantine-color-gray-0)",
    selectors: {
        '[data-mantine-color-scheme="dark"] &': {
            backgroundColor: "var(--mantine-color-dark-6)",
        },
    },
});

export const contentEditableReferenceSearchOpen = style({
    paddingTop: "7rem",
    backgroundColor: "var(--mantine-color-gray-0)",
    selectors: {
        '[data-mantine-color-scheme="dark"] &': {
            backgroundColor: "var(--mantine-color-dark-6)",
        },
    },
});
