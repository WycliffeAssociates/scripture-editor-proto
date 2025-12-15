// src/app/ui/styles/modules/Projectview.css.ts

import { darken, lighten } from "@mantine/core";
import { style } from "@vanilla-extract/css";
import { darkSelector, vars, virtualVars } from "@/app/ui/styles/theme.css.ts";

// Layout
export const appLayout = style({
    display: "grid",
    gridTemplateRows: "auto 1fr",
    height: "100vh",
});

export const appLayoutWithReference = style({
    display: "grid",
    gridTemplateRows: "auto auto 1fr",
    height: "100vh",
});

// Navigation Ribbon
export const navRibbon = style({
    position: "sticky",
    top: 0,
    zIndex: 40,
    padding: "0.25rem .5rem",
    backgroundColor: vars.colors.body,
});

export const mobileRibbon = style({
    backgroundColor: vars.colors.body,
    borderBottom: `1px solid ${vars.colors.gray[3]}`,
    padding: "0.5rem 1rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
});

export const mobileRibbonLeft = style({
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
});

export const mobileRibbonRight = style([mobileRibbonLeft]);

// Desktop Layout
export const desktopContentGrid = style({
    display: "grid",
    gridTemplateColumns: "30fr 40fr 30fr",
    overflow: "hidden",
    height: "100%",
});

export const editorMain = style({
    gridColumn: 2,
    display: "flex",
    justifyContent: "center",
    height: "100%",
    overflowY: "auto",
});

export const editorWrapperDesktop = style({
    width: "100%",
    maxWidth: "65ch",
    margin: "0 auto",
    gridColumn: 2,
});

export const editor = style({
    gridColumn: 2,
    maxWidth: "75ch",
    width: "100%",
    margin: "0 auto",
    position: "relative",
});

export const editorNavButton = style({
    alignSelf: "stretch",
    width: "max-content",
    margin: "0 1rem",
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "0.5rem 1rem",
    boxShadow:
        "0px 1px 3px rgba(31, 31, 31, 0.12), 0px 1px 2px rgba(31, 31, 31, 0.24)",
    borderRadius: "8px",
    backgroundColor: lighten(virtualVars.surface, 0.2),
    color: virtualVars.text,

    selectors: {
        "&:hover": {
            backgroundColor: darken(virtualVars.surface, 0.02),
        },
        [`${darkSelector} &:hover`]: {
            backgroundColor: lighten(virtualVars.surface, 0.3),
        },
        "&:active": {
            transform: "translateY(1px)",
        },
    },

    "@media": {
        "screen and (max-width: 26em)": {
            margin: "0.25rem",
            padding: "0.25rem 0.5rem",
            fontSize: "0.875rem",
        },
    },
});
export const editorNavButtonHidden = style({
    padding: 0,
});
// Mobile Tab Bar
export const mobileTabsBar = style({
    display: "flex",
    paddingBlock: "0.25rem",
    borderBottom: `1px solid ${vars.colors.gray[3]}`,
    backgroundColor: vars.colors.body,
});

export const mobileTabButton = style({
    flex: 1,
    background: "transparent",
    border: "none",
    fontSize: "1rem",
    padding: "0.5rem",
    cursor: "pointer",
    color: vars.colors.gray[7],

    selectors: {
        "&.activeTab": {
            borderBottom: `3px solid ${vars.colors.blue[6]}`,
            fontWeight: 600,
            color: vars.colors.blue[6],
        },
    },
});

// Mobile Editors (Tab Switching)
export const mobileEditorsContainer = style({
    position: "relative",
    height: "100%",
    overflow: "hidden",
});

// Main and reference are *stacked* and toggled with CSS vars
export const editorMainSmall = style({
    position: "absolute",
    inset: 0,
    paddingInline: "1rem",
    overflowY: "auto",
    backgroundColor: vars.colors.body,
    display: "var(--show-main)",
});

export const editorReferenceSmall = style({
    position: "absolute",
    inset: 0,
    paddingInline: "1rem",
    overflowY: "auto",
    backgroundColor: vars.colors.body,
    display: "var(--show-ref)",
});
