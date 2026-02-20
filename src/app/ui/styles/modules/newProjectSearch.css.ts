import { globalStyle, style } from "@vanilla-extract/css";
import { darkSelector, vars, virtualVars } from "@/app/ui/styles/theme.css.ts";

export const shell = style({
    borderRadius: vars.radius.xl,
    border: `1px solid ${vars.colors.gray[3]}`,
    backgroundColor: virtualVars.surface,
    overflow: "hidden",
    maxWidth: "100%",
});

export const topBar = style({
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "center",
    gap: vars.spacing.lg,
    padding: vars.spacing.md,
    borderBottom: `1px solid ${vars.colors.gray[3]}`,
    "@media": {
        "screen and (max-width: 640px)": {
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: vars.spacing.sm,
        },
    },
});

export const topBarTitle = style({
    margin: 0,
    fontSize: "clamp(1.125rem, 1.02rem + 0.55vw, 1.5rem)",
    lineHeight: "1.1",
    letterSpacing: "-0.02em",
    fontWeight: 800,
    color: vars.colors.primary[9],
});

export const topBarRight = style({
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto auto",
    alignItems: "center",
    gap: vars.spacing.sm,
    justifyContent: "end",
    "@media": {
        "screen and (max-width: 640px)": {
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gridAutoRows: "auto",
        },
    },
});

export const searchField = style({
    position: "relative",
    minWidth: 0,
    width: "100%",
    "@media": {
        "screen and (max-width: 640px)": {
            gridColumn: "1 / -1",
        },
    },
});

export const searchIcon = style({
    position: "absolute",
    top: "50%",
    left: vars.spacing.sm,
    transform: "translateY(-50%)",
    color: vars.colors.gray[6],
    pointerEvents: "none",
});

export const searchInput = style({
    width: "100%",
    borderRadius: vars.radius.lg,
    border: `1px solid ${vars.colors.gray[3]}`,
    backgroundColor: vars.colors.gray[0],
    padding: `${vars.spacing.sm} calc(${vars.spacing.xl} + ${vars.spacing.md}) ${vars.spacing.sm} calc(${vars.spacing.xl} + ${vars.spacing.sm})`,
    fontSize: vars.fontSizes.md,
    color: vars.colors.text,
    selectors: {
        "&::placeholder": {
            color: vars.colors.gray[6],
        },
        "&:focus": {
            outline: "none",
            borderColor: vars.colors.primary[5],
            boxShadow: `0 0 0 3px ${vars.colors.primary[1]}`,
        },
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.gray[9],
            borderColor: vars.colors.gray[7],
        },
    },
});

export const clearButton = style({
    position: "absolute",
    top: "50%",
    right: vars.spacing.xs,
    transform: "translateY(-50%)",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: vars.colors.gray[6],
    padding: `calc(${vars.spacing.xs} * 0.5)`,
    borderRadius: vars.radius.md,
    selectors: {
        "&:hover": {
            backgroundColor: vars.colors.gray[1],
            color: vars.colors.gray[7],
        },
        [`${darkSelector} &:hover`]: {
            backgroundColor: vars.colors.gray[8],
        },
    },
});

export const topActionButton = style({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    borderRadius: vars.radius.lg,
    border: `1px solid ${vars.colors.gray[3]}`,
    backgroundColor: vars.colors.gray[0],
    padding: `${vars.spacing.sm} ${vars.spacing.md}`,
    fontSize: vars.fontSizes.sm,
    fontWeight: 600,
    color: vars.colors.primary[9],
    cursor: "pointer",
    selectors: {
        "&:hover": {
            backgroundColor: vars.colors.primary[0],
            borderColor: vars.colors.primary[3],
        },
        "&:disabled": {
            cursor: "not-allowed",
            opacity: 0.6,
        },
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.gray[9],
            borderColor: vars.colors.gray[7],
        },
    },
    "@media": {
        "screen and (max-width: 640px)": {
            justifyContent: "center",
        },
    },
});

export const tableWrap = style({
    width: "100%",
    overflowX: "auto",
});

export const table = style({
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    minWidth: "52rem",
});

export const thead = style({
    backgroundColor: vars.colors.gray[0],
});

export const th = style({
    padding: `${vars.spacing.sm} ${vars.spacing.md}`,
    textAlign: "left",
    fontSize: vars.fontSizes.sm,
    fontWeight: 700,
    color: vars.colors.primary[9],
    borderBottom: `1px solid ${vars.colors.gray[3]}`,
});

export const thInner = style({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.sm,
});

export const thDivider = style({
    borderRight: `1px solid ${vars.colors.gray[3]}`,
});

export const tbodyRow = style({
    cursor: "pointer",
});

export const td = style({
    padding: vars.spacing.md,
    borderBottom: `1px solid ${vars.colors.gray[2]}`,
    backgroundColor: virtualVars.surface,
    verticalAlign: "middle",
});

export const selectedRow = style({});

globalStyle(`${tbodyRow}:hover ${td}`, {
    backgroundColor: vars.colors.primary[0],
});

globalStyle(`${darkSelector} ${tbodyRow}:hover ${td}`, {
    backgroundColor: vars.colors.gray[9],
});

globalStyle(`${selectedRow} ${td}`, {
    backgroundColor: vars.colors.primary[0],
});

globalStyle(`${darkSelector} ${selectedRow} ${td}`, {
    backgroundColor: vars.colors.gray[9],
});

export const projectCell = style({
    fontWeight: 700,
    color: vars.colors.primary[9],
});

export const mutedCell = style({
    color: vars.colors.gray[7],
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "26rem",
});

export const addButton = style({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: vars.colors.primary[6],
    fontSize: vars.fontSizes.sm,
    fontWeight: 700,
    padding: `calc(${vars.spacing.xs} * 0.5) calc(${vars.spacing.xs} * 0.75)`,
    borderRadius: vars.radius.md,
    selectors: {
        "&:hover:not(:disabled)": {
            backgroundColor: vars.colors.primary[0],
            color: vars.colors.primary[8],
        },
        "&:disabled": {
            cursor: "not-allowed",
            color: vars.colors.gray[5],
        },
    },
});

export const emptyState = style({
    padding: `${vars.spacing.xl} ${vars.spacing.md}`,
    color: vars.colors.gray[6],
    fontSize: vars.fontSizes.md,
});

export const errorState = style({
    margin: vars.spacing.md,
    padding: `${vars.spacing.sm} ${vars.spacing.md}`,
    borderRadius: vars.radius.lg,
    backgroundColor: vars.colors.error[0],
    color: vars.colors.error[7],
});

export const hiddenInput = style({
    display: "none",
});
