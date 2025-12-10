import { darken, lighten } from "@mantine/core";
import { style } from "@vanilla-extract/css";
import { darkSelector, vars, virtualVars } from "@/app/ui/styles/theme.css.ts";

/**
 * Styles for the ProjectCreator block.
 *
 * Designed to replace the Tailwind-based styles and to be reused in other places
 * (e.g. modals). Uses theme variables from `theme.css.ts` and supports dark mode
 * via `darkSelector`.
 */

/* Outer container */
export const container = style({
    padding: "1.5rem",
    borderRadius: "8px",
    backgroundColor: virtualVars.surface,
    border: `1px solid ${vars.colors.gray[3]}`,
    boxShadow: `0 1px 2px ${vars.colors.shadow}`,
    // subtle dark-mode adjustments
    // selectors: {
    //   [`${darkSelector} &`]: {
    //     backgroundColor: vars.colors.surface,
    //     border: `1px solid ${vars.colors.gray[8]}`,
    //     boxShadow: `0 1px 2px ${darken(vars.colors.gray[9], 0.02)}`,
    //   },
    // },
});

/* Title / header */
export const title = style({
    margin: 0,
    marginBottom: "0.75rem",
    fontSize: "1.25rem",
    fontWeight: 600,
    color: vars.colors.text,
});

/* Responsive layout: column on small, row on large */
export const layout = style({
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    alignItems: "stretch",
    "@media": {
        "screen and (min-width: 1024px)": {
            flexDirection: "row",
            alignItems: "flex-start",
        },
    },
});

/* Left column (repo search / download) */
export const leftCol = style({
    flex: "1 1 auto",
    maxWidth: "60ch",
});

/* Left column heading */
export const leftHeading = style({
    margin: "0 0 0.5rem 0",
    fontSize: "1rem",
    fontWeight: 500,
    color: vars.colors.text,
});

/* Repo container (where RepoDownload mounts) */
export const repoContainer = style({
    width: "100%",
});

/* Right column (upload controls) */
export const rightCol = style({
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    "@media": {
        "screen and (min-width: 1024px)": {
            width: "18rem", // ~288px like w-72
            marginLeft: "1.5rem",
        },
    },
});

/* Group wrapper for each control block */
export const controlGroup = style({
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
});

/* Label for inputs */
export const label = style({
    fontSize: "0.875rem",
    fontWeight: 500,
    color: vars.colors.text,
});

/* Action row to hold button and description */
export const actionRow = style({
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
});

/* Primary file-button (Select Folder / Choose ZIP) */
export const fileButton = style({
    padding: "0.45rem 0.75rem",
    borderRadius: "6px",
    border: `1px solid ${vars.colors.gray[3]}`,
    backgroundColor: vars.colors.gray[0],
    fontSize: "0.9rem",
    cursor: "pointer",
    color: vars.colors.text,
    selectors: {
        "&:hover": {
            backgroundColor: lighten(vars.colors.gray[0], 0.03),
        },
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.gray[9],
            border: `1px solid ${vars.colors.gray[8]}`,
            color: vars.colors.text,
        },
    },
});

/* Secondary descriptive text next to button */
export const actionDescription = style({
    fontSize: "0.875rem",
    color: vars.colors.gray[6],
    selectors: {
        [`${darkSelector} &`]: {
            color: vars.colors.gray[5],
        },
    },
});

/* Hidden file input */
export const hiddenInput = style({
    display: "none",
});

/* Utility: compact container for the two upload controls on narrow screens */
export const compactControls = style({
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    "@media": {
        "screen and (min-width: 640px)": {
            flexDirection: "column",
        },
    },
});

/**
 * Input used for repository URL / search inputs.
 * Uses theme vars and supports dark mode via darkSelector.
 */
export const repoInput = style({
    padding: "0.5rem 0.6rem",
    borderRadius: "6px",
    border: `1px solid ${vars.colors.gray[3]}`,
    backgroundColor: vars.colors.gray[0],
    color: vars.colors.text,
    fontSize: "0.95rem",
    flex: "1 1 auto",
    width: "100%",
    selectors: {
        "&:focus": {
            outline: "none",
            boxShadow: `0 0 0 3px ${vars.colors.primary[4]}`,
            border: `1px solid ${vars.colors.primary[6]}`,
        },
        [`${darkSelector} &`]: {
            backgroundColor: lighten(virtualVars.surface, 0.1),
            border: `1px solid ${vars.colors.gray[8]}`,
            color: vars.colors.text,
        },
        [`${darkSelector} &:focus`]: {
            outline: "none",
            boxShadow: `0 0 0 3px ${vars.colors.primary[6]}`,
            border: `1px solid ${vars.colors.primary[7]}`,
        },
    },
});

/**
 * Button used to trigger download action for repo import.
 * Styled with theme tokens and with focus/disabled states.
 */
export const downloadButton = style({
    padding: "0.45rem 0.75rem",
    borderRadius: "6px",
    border: `1px solid ${vars.colors.primary[7]}`,
    backgroundColor: vars.colors.primary[6],
    color: vars.colors.white,
    fontSize: "0.95rem",
    cursor: "pointer",
    selectors: {
        "&:hover": {
            backgroundColor: vars.colors.primary[7],
        },
        "&:focus": {
            outline: "none",
            boxShadow: `0 0 0 3px ${vars.colors.primary[5]}`,
        },
        "&:disabled": {
            opacity: 0.8,
            cursor: "not-allowed",
            backgroundColor: vars.colors.gray[4],
            border: `1px solid ${vars.colors.gray[3]}`,
        },
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.primary[7],
            border: `1px solid ${vars.colors.primary[8]}`,
            color: vars.colors.white,
        },
        [`${darkSelector} &:hover`]: {
            backgroundColor: vars.colors.primary[8],
        },
        [`${darkSelector} &:disabled`]: {
            opacity: 0.6,
            cursor: "not-allowed",
            backgroundColor: vars.colors.gray[9],
            border: `1px solid ${vars.colors.gray[8]}`,
        },
    },
});

/* Autocomplete / dropdown styles used by AutocompleteInput */
export const acContainer = style({
    width: "100%",
    position: "relative",
    marginBottom: "1rem",
});

export const acLabel = style({
    display: "block",
    marginBottom: "0.5rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    color: vars.colors.text,
});
export const acItemContent = style({
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
});

export const acSelected = style({
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginTop: "0.5rem",
    padding: "0.5rem",
    borderRadius: "6px",
    backgroundColor: vars.colors.gray[0],
    color: vars.colors.text,
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.gray[9],
            color: vars.colors.text,
        },
    },
});

export const acSelectedAvatar = style({
    width: "2rem",
    height: "2rem",
    borderRadius: "9999px",
    objectFit: "cover",
});

export const acSelectedText = style({
    fontWeight: 600,
    color: vars.colors.text,
});

export const acClearButton = style({
    marginLeft: "auto",
    background: "transparent",
    border: "none",
    color: vars.colors.red[6],
    cursor: "pointer",
    fontSize: "0.9rem",
    selectors: {
        "&:hover": {
            color: vars.colors.red[7],
        },
        [`${darkSelector} &`]: {
            color: vars.colors.red[5],
        },
        [`${darkSelector} &:hover`]: {
            color: vars.colors.red[6],
        },
    },
});

export const acDropdown = style({
    position: "absolute",
    zIndex: 999,
    width: "100%",
    backgroundColor: virtualVars.surface,
    border: `1px solid ${virtualVars.border}`,
    borderRadius: "6px",
    boxShadow: `0 6px 18px rgba(16, 24, 40, 0.08)`,
    marginTop: "0.5rem",
    maxHeight: "12rem",
    overflowY: "auto",
    selectors: {
        [`${darkSelector} &`]: {
            // backgroundColor: vars.colors.surfaceDark[0] ?? vars.colors.surface,
            border: `1px solid ${virtualVars.border}`,
            boxShadow: `0 6px 18px rgba(2, 6, 23, 0.6)`,
        },
    },
});

export const acListItem = style({
    padding: "0.5rem 0.75rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    color: vars.colors.text,
    selectors: {
        "&:hover": {
            backgroundColor: vars.colors.primary[0],
        },
        [`${darkSelector} &:hover`]: {
            backgroundColor: darken(vars.colors.gray[9], 0.03),
        },
    },
});

export const acItemAvatar = style({
    width: "2rem",
    height: "2rem",
    borderRadius: "9999px",
    objectFit: "cover",
});

export const acItemText = style({
    fontSize: "0.95rem",
    color: vars.colors.text,
});

export const acLoading = style({
    padding: "0.5rem",
    color: vars.colors.gray[6],
    backgroundColor: virtualVars.surface,
    selectors: {
        [`${darkSelector} &`]: {
            color: vars.colors.gray[5],
            backgroundColor: vars.colors.surfaceDark[0],
        },
    },
});

export const acError = style({
    padding: "0.5rem",
    color: vars.colors.error[6],
    backgroundColor: vars.colors.error[0],
    borderRadius: "6px",
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.error[1],
        },
    },
});

/* Highlighted state for keyboard navigation */
export const acHighlighted = style({
    backgroundColor: vars.colors.primary[1],
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: darken(vars.colors.primary[2], 0.02),
        },
    },
});
