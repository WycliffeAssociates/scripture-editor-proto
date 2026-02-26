import { globalStyle, style } from "@vanilla-extract/css";
import { breakpoints, darkSelector, vars } from "@/app/ui/styles/theme.css.ts";

// --- Layout & Containers ---

// Diff Item Container
export const diffItem = style({
    marginBottom: vars.spacing.xl,
    padding: vars.spacing.xs,
    borderRadius: vars.radius.md,
    backgroundColor: vars.colors.body,
    "@media": {
        [breakpoints.minWSmall]: {
            padding: vars.spacing.md,
        },
    },
});

// Diff Grid Padding (for lg+ desktop layout)
export const diffGrid = style({
    padding: `${vars.spacing.sm} 0`,
    justifyContent: "space-between",
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gridGap: vars.spacing.xl,
});

// Stacked layout for small screens
export const diffStacked = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xl,
    padding: 0,
});

// Modal content wrapper
export const modalScrollPaper = style({
    height: "100%",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    backgroundColor: "transparent",
    paddingBlock: 0,
    paddingInline: 0,
    "@media": {
        [breakpoints.minWSmall]: {
            paddingInline: vars.spacing.md,
        },
    },
});

// ScrollArea height constraint
export const diffScrollArea = style({
    height: "100%",
    minHeight: 0,
    overflow: "auto",
    paddingRight: 0,
    "@media": {
        [breakpoints.minWSmall]: {
            paddingRight: vars.spacing.xs,
        },
    },
});

// Center content (loader/empty state)
export const fullHeight = style({
    height: "100%",
});

export const modalBody = style({
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    paddingTop: vars.spacing.sm,
    "@media": {
        [breakpoints.minWSmall]: {
            paddingTop: vars.spacing.md,
        },
    },
});

export const modalBodyScrollable = style({
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    paddingTop: 0,
    paddingBottom: vars.spacing.xl,
});

export const modalContent = style({
    height: "95vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars.colors.gray[0],
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.dark[8],
        },
    },
});

export const modalBodyRoot = style({
    flex: 1,
    minHeight: 0,
    paddingTop: vars.spacing.md,
});

export const modalHeader = style({
    borderBottom: "none",
    paddingBottom: 0,
    "@media": {
        [breakpoints.minWSmall]: {
            paddingBlock: vars.spacing.md,
        },
    },
});

export const modalTitle = style({
    fontSize: vars.fontSizes.lg,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    paddingInline: vars.spacing.xs,
    margin: 0,
    lineHeight: 1.05,
    "@media": {
        [breakpoints.minWSmall]: {
            fontSize: vars.fontSizes.xl,
        },
    },
});

// --- Header & Text Styles ---

// Sticky header in modal
export const stickyHeader = style({
    flex: "0 0 auto",
    zIndex: 2,
    backgroundColor: "transparent",
    padding: `0 0 ${vars.spacing.xs}`,
    display: "grid",
    gap: vars.spacing.sm,
});

export const toolbarSection = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.sm,
});

export const toolbarRow = style({
    display: "flex",
    flexWrap: "wrap",
    gap: vars.spacing.sm,
    alignItems: "center",
});

export const toolbarBand = style({
    padding: `${vars.spacing.xs} ${vars.spacing.xs}`,
    borderRadius: vars.radius.md,
    backgroundColor: vars.colors.body,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    overflowX: "auto",
    msOverflowStyle: "none",
    scrollbarWidth: "none",
    selectors: {
        "&::-webkit-scrollbar": {
            display: "none",
        },
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.dark[6],
            boxShadow: "none",
        },
    },
});

export const warningStrip = style({
    borderRadius: vars.radius.md,
    backgroundColor: vars.colors.orange[0],
    padding: vars.spacing.sm,
    border: `1px solid ${vars.colors.orange[2]}`,
    selectors: {
        [`${darkSelector} &`]: {
            borderColor: vars.colors.orange[9],
            backgroundColor: vars.colors.dark[5],
        },
    },
});

// Labels for Original/Current sections
export const diffLabel = style({
    textTransform: "uppercase",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.1em",
    color: vars.colors.dimmed,
});

// SID Header Text
export const diffSidHeader = style({
    fontWeight: 600,
    fontSize: vars.fontSizes.md,
    letterSpacing: "-0.01em",
    margin: 0,
});

// Preformatted text styles (the actual verse content)
export const diffPre = style({
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "inherit",
    color: "inherit",
    lineHeight: 1.6,
    fontSize: vars.fontSizes.md,
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
    minHeight: "3rem",
});

export const paperBgDefault = style({
    backgroundColor: vars.colors.gray[0],
    borderRadius: vars.radius.md,
    border: "none",
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.dark[6],
        },
    },
});

export const paperBgDeletion = style({
    backgroundColor: "#fff5f5",
    borderRadius: vars.radius.md,
    border: "none",
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: "rgba(255, 0, 0, 0.1)",
            color: vars.colors.red[2],
        },
    },
});

export const paperBgAddition = style({
    backgroundColor: "#f4fcf3",
    borderRadius: vars.radius.md,
    border: "none",
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: "rgba(0, 255, 0, 0.05)",
            color: vars.colors.green[2],
        },
    },
});

// --- Highlight Spans (Word level diffs) ---

export const diffHighlightAdded = style({
    backgroundColor: "#c6f6d5",
    borderRadius: "2px",
    padding: "0 2px",
    color: "#22543d",
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: "rgba(72, 187, 120, 0.3)",
            color: "#9ae6b4",
        },
    },
});

export const diffHighlightRemoved = style({
    backgroundColor: "#fed7d7",
    borderRadius: "2px",
    padding: "0 2px",
    color: "#822727",
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: "rgba(245, 101, 101, 0.3)",
            color: "#feb2b2",
        },
    },
});

export const chapterDiffItem = style({
    height: "100%",
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: vars.spacing.md,
});

export const chapterDiffPanel = style({
    minHeight: 0,
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    backgroundColor: vars.colors.body,
    borderRadius: vars.radius.lg,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    border: "none",
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.dark[6],
            boxShadow: "none",
        },
    },
});

export const chapterGrid = style({
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: vars.spacing.xl,
    minHeight: 0,
    height: "100%",
    "@media": {
        [breakpoints.minWMd]: {
            gridTemplateColumns: "1fr 1fr",
        },
    },
});

export const chapterColumn = style({
    minHeight: 0,
    height: "100%",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: vars.spacing.sm,
});

export const chapterDiffBody = style({
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    lineHeight: 1.8,
    fontSize: vars.fontSizes.sm,
    fontFamily: "inherit",
    padding: vars.spacing.sm,
    "@media": {
        [breakpoints.minWSmall]: {
            fontSize: vars.fontSizes.md,
        },
        [breakpoints.minWMd]: {
            fontSize: vars.fontSizes.lg,
        },
    },
});

globalStyle(`${chapterDiffBody} > .usfm-para-container`, {
    width: "100%",
    maxWidth: "100%",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    "@media": {
        [breakpoints.minWMd]: {
            width: "max-content",
        },
    },
});

export const chapterPartChanged = style({
    position: "relative",
    display: "inline",
});

export const chapterHunkAction = style({
    float: "right",
    marginLeft: vars.spacing.xs,
    marginTop: "0.2em",
    marginRight: 0,
    zIndex: 1,
    backgroundColor: vars.colors.blue[0],
    border: "none",
    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
    transition: "transform 0.1s ease",
    selectors: {
        "&:hover": {
            transform: "scale(1.1)",
        },
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.dark[4],
        },
    },
});
