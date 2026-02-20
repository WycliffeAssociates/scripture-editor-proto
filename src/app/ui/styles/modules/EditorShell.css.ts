import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/theme.css.ts";

export const editorOuter = style({
    padding: vars.spacing.sm,
});

export const editorContainer = style({
    position: "relative",
});

export const contentEditable = style({
    outline: "none",
    width: "100%",
    padding: vars.spacing.sm,
});

export const contentEditableSearchOpen = style({
    paddingTop: "7rem",
});
export const loadingReference = style({
    padding: vars.spacing.md,
});
export const contentEditableReference = style({
    outline: "none",
    width: "100%",
    padding: vars.spacing.md,
    backgroundColor: vars.colors.gray[0],
    selectors: {
        '[data-mantine-color-scheme="dark"] &': {
            backgroundColor: vars.colors.dark[6],
        },
    },
});

export const contentEditableReferenceSearchOpen = style({
    paddingTop: "7rem",
    backgroundColor: vars.colors.gray[0],
    selectors: {
        '[data-mantine-color-scheme="dark"] &': {
            backgroundColor: vars.colors.dark[6],
        },
    },
});
