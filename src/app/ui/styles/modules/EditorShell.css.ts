import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { vars as dsVars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

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
    padding: vars.spacing.sm,
});

export const editorContainer = style({
    position: "relative",
    minHeight: 0,
    transition: "opacity 120ms ease",
});

export const editorContainerSwitching = style({
    opacity: 0.56,
});

export const contentEditable = style({
    outline: "none",
    width: "100%",
    minHeight: "100%",
    padding: `${vars.spacing.sm} ${vars.spacing.sm} 20rem`,
    zIndex: zLayer.editorContent,
    fontFamily: vars.typography.fontFamilySerif,
    maxWidth: "75ch",
    margin: "0 auto",
    selectors: {
        '&[data-mode="plain"]': {
            fontFamily: vars.typography.fontFamilyMono,
        },
    },
});

export const contentEditableSearchOpen = style({
    paddingTop: "7rem",
});

const spinnerRotate = keyframes({
    from: { transform: "rotate(0deg)" },
    to: { transform: "rotate(360deg)" },
});

export const switchingOverlay = style({
    position: "absolute",
    top: vars.spacing.md,
    right: vars.spacing.md,
    zIndex: zLayer.editorSwitchingOverlay,
    borderRadius: vars.radius.full,
    border: `1px solid ${vars.colors.gray[3]}`,
    backgroundColor: vars.colors.gray[0],
    color: vars.colors.gray[6],
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    fontSize: dsVars.typography.bodySmall.fontSize,
    lineHeight: 1,
    fontWeight: 600,
    padding: `0.4rem ${vars.spacing.sm}`,
    pointerEvents: "none",
    selectors: {
        '[data-theme="dark"] &': {
            backgroundColor: vars.colors.dark[6],
            borderColor: vars.colors.dark[4],
        },
    },
});

export const switchingOverlaySpinner = style({
    width: "0.875rem",
    height: "0.875rem",
    borderRadius: vars.radius.full,
    border: `2px solid ${vars.colors.gray[3]}`,
    borderTopColor: vars.colors.gray[9],
    animation: `${spinnerRotate} 0.65s linear infinite`,
    selectors: {
        '[data-theme="dark"] &': {
            borderColor: vars.colors.gray[6],
            borderTopColor: vars.colors.gray[0],
        },
    },
});
// Shown over the editor pane while the interaction gate is closed for a
// pending crash-recovery decision: a calm scrim that blocks editing (and the
// lint affordances) until the user resolves the Keep/Discard banner above. The
// banner itself lives outside this pane, so it stays interactive.
export const gateOverlay = style({
    position: "absolute",
    inset: 0,
    zIndex: zLayer.editorSwitchingOverlay,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: "4rem",
    backgroundColor: `color-mix(in srgb, ${dsVars.color.surfacePrimary} 60%, transparent)`,
    cursor: "not-allowed",
    pointerEvents: "auto",
});

export const gateOverlayNote = style({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    padding: `0.5rem ${vars.spacing.sm}`,
    borderRadius: vars.radius.full,
    backgroundColor: vars.colors.gray[0],
    border: `1px solid ${vars.colors.gray[3]}`,
    color: vars.colors.gray[6],
    fontSize: dsVars.typography.bodySmall.fontSize,
    fontWeight: 600,
    boxShadow: dsVars.shadow.medium,
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
    whiteSpace: "normal",
});

globalStyle(`${translationNoteBody} h1`, {
    fontSize: "1.25rem",
    marginBlockStart: "1rem",
    marginBlockEnd: "0.5rem",
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
