import { rem } from "@mantine/core";
import { style } from "@vanilla-extract/css";
import { darkSelector, vars } from "@/app/ui/styles/theme.css.ts";

// --- Layout & Containers ---

// Diff Item Container
export const diffItem = style({
  marginBottom: "1.5rem",
  border: `1px solid ${vars.colors.gray[3]}`,
  borderRadius: "4px",
  selectors: {
    [`${darkSelector} &`]: {
      borderColor: vars.colors.dark[4],
    },
  },
});

// Diff Grid Padding (for lg+ desktop layout)
export const diffGrid = style({
  padding: "12px",
  justifyContent: "space-between",
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gridGap: rem(16),
});

// Stacked layout for small screens
export const diffStacked = style({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
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
});

// Center content (loader/empty state)
export const fullHeight = style({
  height: "100%",
});

// --- Header & Text Styles ---

// Sticky header in modal
export const stickyHeader = style({
  position: "sticky",
  top: 0,
  zIndex: 2,
  backgroundColor: vars.colors.body,
  padding: "0.5rem 0",
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
  marginRight: "0.5rem",
});

// Labels for Original/Current sections
export const diffLabel = style({
  textTransform: "uppercase",
  fontSize: "0.75rem",
  fontWeight: 700,
  marginBottom: "0.5rem",
});

// SID Header Text
export const diffSidHeader = style({
  fontWeight: 500,
  fontSize: "0.875rem",
});

// Detail Warning Text
export const diffDetailWarning = style({
  color: vars.colors.orange[6],
  fontSize: "0.75rem",
  fontWeight: 700,
});

// Preformatted text styles (the actual verse content)
export const diffPre = style({
  margin: 0,
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
  color: "inherit",
});

// Placeholder text for added/deleted verses
export const versePlaceholder = style({
  color: vars.colors.dimmed,
  textAlign: "center",
  fontSize: "0.875rem",
  fontStyle: "italic",
  paddingTop: "4px",
});

// --- Paper Background Variants ---

export const paperMinHeight = style({
  minHeight: "40px",
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
