import { style } from "@vanilla-extract/css";
import { breakpoints, darkSelector, vars } from "@/app/ui/styles/theme.css.ts";

// --- Layout & Containers ---

// Diff Item Container
export const diffItem = style({
    marginBottom: vars.spacing.xl,
    border: `1px solid ${vars.colors.gray[3]}`,
    borderRadius: vars.radius.sm,
    padding: vars.spacing.xs,
    "@media": {
        [breakpoints.minWSmall]: {
            padding: vars.spacing.sm,
        },
    },
    selectors: {
        [`${darkSelector} &`]: {
            borderColor: vars.colors.dark[4],
        },
    },
});

// Diff Grid Padding (for lg+ desktop layout)
export const diffGrid = style({
    padding: vars.spacing.md,
    justifyContent: "space-between",
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gridGap: vars.spacing.lg,
});

// Stacked layout for small screens
export const diffStacked = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.md,
    padding: `0 ${vars.spacing.xs}`,
    "@media": {
        [breakpoints.minWSmall]: {
            padding: `0 ${vars.spacing.sm}`,
        },
    },
});

// Modal content wrapper
export const modalScrollPaper = style({
    maxHeight: "90vh",
    overflow: "auto",
    backgroundColor: "transparent", // Let Mantine Modal handle bg
});

// ScrollArea height constraint
export const diffScrollArea = style({
    height: "60vh",
    overflow: "auto",
});

// Center content (loader/empty state)
export const fullHeight = style({
    height: "100%",
});
export const modalHeader = style({
    padding: vars.spacing.sm,
    "@media": {
        [breakpoints.minWSmall]: {
            padding: vars.spacing.lg,
        },
    },
});

// --- Header & Text Styles ---

// Sticky header in modal
export const stickyHeader = style({
    position: "sticky",
    top: 0,
    zIndex: 2,
    backgroundColor: vars.colors.body,
    padding: `0 0 ${vars.spacing.sm}`,
    display: "flex",
    justifyContent: "flex-end",
    borderBottom: `1px solid ${vars.colors.gray[3]}`,
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.dark[7],
            borderColor: vars.colors.dark[4],
        },
    },
});

// Save button margin
export const saveAllButtonMargin = style({
    marginRight: vars.spacing.sm,
});

// Labels for Original/Current sections
export const diffLabel = style({
    textTransform: "uppercase",
    fontSize: vars.fontSizes.xs,
    fontWeight: 700,
    marginBottom: vars.spacing.sm,
});

// SID Header Text
export const diffSidHeader = style({
    fontWeight: 500,
    fontSize: vars.fontSizes.sm,
});

// Detail Warning Text

// Preformatted text styles (the actual verse content)
export const diffPre = style({
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "inherit",
    color: "inherit",
});

// Placeholder text for added/deleted verses
export const versePlaceholder = style({
    color: vars.colors.dimmed,
    textAlign: "center",
    fontSize: vars.fontSizes.sm,
    fontStyle: "italic",
    paddingTop: vars.spacing.xs,
});

// --- Paper Background Variants ---

export const paperMinHeight = style({
    minHeight: "2.5rem",
});

export const paperBgDefault = style({
    backgroundColor: vars.colors.gray[0],
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.dark[6],
        },
    },
});

export const paperBgDeletion = style({
    backgroundColor: vars.colors.red[0],
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.red[9],
            color: vars.colors.red[0],
        },
    },
});

export const paperBgAddition = style({
    backgroundColor: vars.colors.green[0],
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.green[9],
            color: vars.colors.green[0],
        },
    },
});

// --- Highlight Spans (Word level diffs) ---

export const diffHighlightAdded = style({
    backgroundColor: vars.colors.green[4],
    fontWeight: "bold",
    color: vars.colors.black, // Ensure readability on green
});

export const diffHighlightRemoved = style({
    backgroundColor: vars.colors.red[4],
    fontWeight: "bold",
    color: vars.colors.black, // Ensure readability on red
});
