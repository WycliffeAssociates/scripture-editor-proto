import { darken } from "@mantine/core";
import { style } from "@vanilla-extract/css";
import { darkSelector, vars, virtualVars } from "@/app/ui/styles/theme.css.ts";

export const container = style({
    padding: "2rem",
    borderRadius: "14px",
    backgroundColor: virtualVars.surface,
    border: `1px solid ${vars.colors.gray[3]}`,
    boxShadow: `0 1px 2px ${vars.colors.shadow}`,
    "@media": {
        "screen and (max-width: 768px)": {
            padding: "1.25rem",
        },
    },
});

export const title = style({
    margin: 0,
    marginBottom: "1.5rem",
    fontSize: "2.35rem",
    lineHeight: "1.1",
    letterSpacing: "-0.02em",
    color: vars.colors.primary[9],
    "@media": {
        "screen and (max-width: 768px)": {
            fontSize: "1.9rem",
        },
    },
});

export const layout = style({
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "2rem",
    alignItems: "start",
    "@media": {
        "screen and (min-width: 1024px)": {
            gridTemplateColumns: "minmax(0, 2.2fr) minmax(260px, 1fr)",
            gap: "2.5rem",
        },
    },
});

export const leftCol = style({
    minWidth: 0,
});

export const leftHeading = style({
    margin: "0 0 0.75rem 0",
    fontSize: "1.95rem",
    lineHeight: "1.1",
    letterSpacing: "-0.02em",
    color: vars.colors.primary[9],
    "@media": {
        "screen and (max-width: 768px)": {
            fontSize: "1.45rem",
        },
    },
});

export const repoContainer = style({
    width: "100%",
});

export const rightCol = style({
    width: "100%",
    maxWidth: "100%",
    "@media": {
        "screen and (min-width: 1024px)": {
            maxWidth: "26rem",
        },
    },
});

export const compactControls = style({
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
});

export const controlGroup = style({
    display: "flex",
    flexDirection: "column",
    gap: "0.55rem",
});

export const label = style({
    fontSize: "1.15rem",
    fontWeight: 700,
    lineHeight: "1.1",
    color: vars.colors.primary[9],
    "@media": {
        "screen and (max-width: 768px)": {
            fontSize: "1.05rem",
        },
    },
});

export const actionRow = style({
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "1rem",
    alignItems: "center",
});

export const fileButton = style({
    minWidth: "9.5rem",
    minHeight: "5.5rem",
    padding: "0.75rem",
    borderRadius: "12px",
    border: `1px solid ${vars.colors.gray[4]}`,
    backgroundColor: vars.colors.gray[0],
    fontSize: "0.9rem",
    lineHeight: "1.2",
    letterSpacing: "-0.01em",
    fontWeight: 500,
    cursor: "pointer",
    color: vars.colors.primary[9],
    selectors: {
        "&:hover": {
            backgroundColor: vars.colors.primary[0],
            borderColor: vars.colors.primary[3],
        },
        "&:disabled": {
            cursor: "not-allowed",
            opacity: 0.65,
        },
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.gray[9],
            borderColor: vars.colors.gray[7],
        },
    },
});

export const actionDescription = style({
    fontSize: "0.95rem",
    lineHeight: "1.35",
    color: vars.colors.gray[6],
    maxWidth: "20rem",
});

export const hiddenInput = style({
    display: "none",
});

export const repoInput = style({
    padding: "0.8rem 0.95rem",
    borderRadius: "10px",
    border: `1px solid ${vars.colors.gray[4]}`,
    backgroundColor: vars.colors.gray[0],
    color: vars.colors.primary[9],
    fontSize: "1rem",
    lineHeight: "1.3",
    width: "100%",
    selectors: {
        "&::placeholder": {
            color: vars.colors.gray[5],
        },
        "&:focus": {
            outline: "none",
            boxShadow: `0 0 0 3px ${vars.colors.primary[2]}`,
            borderColor: vars.colors.primary[5],
        },
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.gray[9],
            borderColor: vars.colors.gray[7],
            color: vars.colors.gray[1],
        },
    },
});

export const downloadButton = style({
    marginTop: "0.9rem",
    minHeight: "3rem",
    padding: "0.45rem 1.1rem",
    borderRadius: "10px",
    border: `1px solid ${vars.colors.gray[4]}`,
    backgroundColor: vars.colors.gray[4],
    color: vars.colors.white,
    fontSize: "1rem",
    lineHeight: "1.2",
    letterSpacing: "-0.01em",
    cursor: "pointer",
    selectors: {
        "&:hover:not(:disabled)": {
            backgroundColor: vars.colors.primary[6],
            borderColor: vars.colors.primary[7],
        },
        "&:disabled": {
            cursor: "not-allowed",
            opacity: 0.95,
        },
    },
});

export const searchLabel = style({
    margin: 0,
    marginBottom: "0.7rem",
    fontSize: "1.75rem",
    lineHeight: "1.2",
    fontWeight: 600,
    color: vars.colors.primary[9],
});

export const searchInputShell = style({
    position: "relative",
    marginBottom: "0.8rem",
});

export const searchIcon = style({
    position: "absolute",
    top: "50%",
    left: "0.75rem",
    transform: "translateY(-50%)",
    color: vars.colors.gray[6],
    pointerEvents: "none",
});

export const searchInput = style([
    repoInput,
    {
        paddingLeft: "2.5rem",
    },
]);

export const searchTable = style({
    borderRadius: "12px",
    border: `1px solid ${vars.colors.gray[3]}`,
    overflow: "hidden",
});

export const tableHeader = style({
    display: "grid",
    gridTemplateColumns:
        "minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 0.9fr) auto",
    gap: "0.5rem",
    padding: "0.75rem 0.9rem",
    backgroundColor: vars.colors.gray[1],
    borderBottom: `1px solid ${vars.colors.gray[3]}`,
    fontSize: "0.95rem",
    fontWeight: 600,
    color: vars.colors.primary[9],
});

export const tableBody = style({
    maxHeight: "23rem",
    overflowY: "auto",
    backgroundColor: virtualVars.surface,
});

export const tableRow = style({
    display: "grid",
    gridTemplateColumns:
        "minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 0.9fr) auto",
    gap: "0.5rem",
    alignItems: "center",
    padding: "0.7rem 0.9rem",
    borderBottom: `1px solid ${vars.colors.gray[2]}`,
    fontSize: "0.95rem",
    color: vars.colors.primary[9],
    selectors: {
        "&:hover": {
            backgroundColor: vars.colors.primary[0],
        },
    },
});

export const selectedRow = style({
    backgroundColor: vars.colors.primary[0],
});

export const tableCellStrong = style({
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
});

export const tableCell = style({
    color: vars.colors.gray[7],
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
});

export const addAction = style({
    border: "none",
    background: "transparent",
    color: vars.colors.primary[6],
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
    selectors: {
        "&:hover:not(:disabled)": {
            color: vars.colors.primary[8],
        },
        "&:disabled": {
            color: vars.colors.gray[5],
            cursor: "not-allowed",
        },
    },
});

export const emptyState = style({
    padding: "1.25rem",
    color: vars.colors.gray[6],
    fontSize: "1rem",
});

export const errorState = style({
    marginBottom: "0.75rem",
    padding: "0.65rem 0.75rem",
    borderRadius: "8px",
    color: vars.colors.error[7],
    backgroundColor: vars.colors.error[0],
});

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
});

export const acError = style({
    padding: "0.5rem",
    color: vars.colors.error[6],
    backgroundColor: vars.colors.error[0],
    borderRadius: "6px",
});

export const acHighlighted = style({
    backgroundColor: vars.colors.primary[1],
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: darken(vars.colors.primary[2], 0.02),
        },
    },
});

export const acGroupHeader = style({
    padding: "0.25rem 0.75rem",
    fontSize: "0.8rem",
    fontWeight: 600,
    color: vars.colors.gray[6],
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    cursor: "default",
});
