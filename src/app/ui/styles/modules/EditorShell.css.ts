import { style } from "@vanilla-extract/css";
import { vars as dsVars } from "@/app/ui/styles/designSystem.css.ts";

const vars = {
    ...dsVars,
    radius: dsVars.border.radius,
    colors: {
        ...dsVars.color,
        gray: {
            0: dsVars.color.surfacePrimary,
            3: dsVars.color.surfaceBorder,
            6: dsVars.color.onSurfaceSecondary,
            9: dsVars.color.surfaceInvert,
        },
        dark: {
            4: dsVars.color.surfaceTertiary,
            6: dsVars.color.surfaceSecondary,
        },
    },
};

export const editorOuter = style({
    flex: "1 1 auto",
    position: "relative",
    minHeight: 0,
    overflowY: "auto",
    padding: vars.spacing.sm,
    overscrollBehavior: "contain",
});

export const editorContainer = style({
    position: "relative",
    minHeight: 0,
});

export const contentEditable = style({
    outline: "none",
    width: "100%",
    minHeight: "100%",
    padding: `${vars.spacing.sm} ${vars.spacing.sm} 20rem`,
    zIndex: 5100,
});

export const contentEditableSearchOpen = style({
    paddingTop: "7rem",
});
export const loadingReference = style({
    padding: vars.spacing.md,
});

export const translationNotesContainer = style({
    padding: vars.spacing.md,
    display: "grid",
    gap: vars.spacing.md,
});

export const translationNoteCard = style({
    border: `1px solid ${vars.colors.gray[3]}`,
    borderRadius: vars.radius.md,
    padding: vars.spacing.md,
    backgroundColor: vars.colors.gray[0],
    selectors: {
        '[data-theme="dark"] &': {
            backgroundColor: vars.colors.dark[6],
            borderColor: vars.colors.dark[4],
        },
    },
});

export const translationNoteBody = style({
    whiteSpace: "pre-wrap",
});
export const contentEditableReference = style({
    outline: "none",
    width: "100%",
    minHeight: "100%",
    padding: vars.spacing.md,
    backgroundColor: vars.colors.gray[0],
    selectors: {
        '[data-theme="dark"] &': {
            backgroundColor: vars.colors.dark[6],
        },
    },
});

export const contentEditableReferenceSearchOpen = style({
    paddingTop: "7rem",
    backgroundColor: vars.colors.gray[0],
    selectors: {
        '[data-theme="dark"] &': {
            backgroundColor: vars.colors.dark[6],
        },
    },
});

export const referenceEditorRoot = style({
    minHeight: 0,
    height: "100%",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
});

export const referenceEditorOuter = style({
    flex: "1 1 auto",
    position: "relative",
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
});
