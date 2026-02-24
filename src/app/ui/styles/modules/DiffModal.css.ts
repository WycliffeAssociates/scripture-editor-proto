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
    height: "100%",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    backgroundColor: "transparent",
    paddingBlock: 0,
    paddingInline: vars.spacing.xs,
});

// ScrollArea height constraint
export const diffScrollArea = style({
    height: "100%",
    minHeight: 0,
    overflow: "auto",
});

// Center content (loader/empty state)
export const fullHeight = style({
    height: "100%",
});

export const modalBody = style({
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
});

export const modalBodyScrollable = style({
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    paddingBottom: vars.spacing.sm,
});

export const modalContent = style({
    height: "95vh",
    display: "flex",
    flexDirection: "column",
});

export const modalBodyRoot = style({
    flex: 1,
    minHeight: 0,
    paddingTop: 0,
});
export const modalHeader = style({
    "@media": {
        [breakpoints.minWSmall]: {
            paddingBlock: vars.spacing.sm,
        },
    },
});
export const modalTitle = style({
    fontSize: vars.fontSizes.lg,
    paddingInline: vars.spacing.xs,
    margin: 0,
});

// --- Header & Text Styles ---

// Sticky header in modal
export const stickyHeader = style({
    flex: "0 0 auto",
    zIndex: 2,
    backgroundColor: vars.colors.body,
    padding: `0 0 ${vars.spacing.xs}`,
    display: "grid",
    gap: vars.spacing.xs,
    borderBottom: `1px solid ${vars.colors.gray[3]}`,
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.dark[7],
            borderColor: vars.colors.dark[4],
        },
    },
});

export const toolbarSection = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
});

export const toolbarSectionTitle = style({
    fontSize: vars.fontSizes.xs,
    fontWeight: 700,
    textTransform: "uppercase",
    color: vars.colors.dimmed,
    letterSpacing: "0.04em",
});

export const toolbarRow = style({
    display: "flex",
    flexWrap: "wrap",
    gap: vars.spacing.xs,
    alignItems: "center",
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
});

// SID Header Text
export const diffSidHeader = style({
    fontWeight: 500,
    fontSize: vars.fontSizes.sm,
    margin: 0,
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
    backgroundColor: vars.colors.green[3],
    fontWeight: "bold",
    color: vars.colors.black, // Ensure readability on green
});

export const diffHighlightRemoved = style({
    backgroundColor: vars.colors.red[2],
    fontWeight: "bold",
    color: vars.colors.black, // Ensure readability on red
});

export const chapterDiffItem = style({
    // marginBottom: vars.spacing.sm,
    border: `1px solid ${vars.colors.gray[3]}`,
    borderRadius: vars.radius.sm,
    padding: vars.spacing.xs,
    height: "100%",
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: vars.spacing.xs,
    selectors: {
        [`${darkSelector} &`]: {
            borderColor: vars.colors.dark[4],
        },
    },
});

export const chapterDiffPanel = style({
    minHeight: 0,
    height: "100%",
    overflow: "auto",
    backgroundColor: vars.colors.gray[0],
    border: `1px solid ${vars.colors.gray[3]}`,
    borderRadius: vars.radius.md,
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.dark[6],
            borderColor: vars.colors.dark[4],
        },
    },
});

export const chapterGrid = style({
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: vars.spacing.md,
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
    gap: vars.spacing.xs,
});

export const chapterDiffBody = style({
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    lineHeight: 1.7,
    fontSize: vars.fontSizes.lg,
    fontFamily: "inherit",
});

export const chapterPart = style({
    position: "relative",
    display: "inline",
});

export const chapterPartChanged = style({
    position: "relative",
    display: "inline",
});

export const chapterSeparator = style({
    whiteSpace: "pre",
});

export const chapterHunkAction = style({
    display: "inline-flex",
    verticalAlign: "middle",
    marginRight: vars.spacing.xs,
    marginTop: 0,
    marginBottom: 0,
    paddingInline: vars.spacing.xs,
    selectors: {
        "&:hover": {
            transform: "translateY(-1px)",
        },
    },
});
