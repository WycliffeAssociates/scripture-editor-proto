import { darken, lighten } from "@mantine/core";
import { style } from "@vanilla-extract/css";
import { darkSelector, vars, virtualVars } from "@/app/ui/styles/theme.css.ts";

// Diff Item Container
export const diffItem = style({
  marginBottom: "1.5rem",
  border: `1px solid ${vars.colors.gray[3]}`,
  borderRadius: "4px",
});

// Diff Grid Padding (for lg+ desktop layout)
export const diffGrid = style({
  padding: "12px",
});

// Stacked layout for small screens
export const diffStacked = style({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
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

// Paper Background Variants (use with Mantine Paper className)
export const paperBgDefault = style({
  backgroundColor: vars.colors.gray[0],
});

export const paperBgDeletion = style({
  backgroundColor: vars.colors.red[0],
  selectors: {
    [`${darkSelector} &`]: {
      backgroundColor: vars.colors.red[1],
    },
  },
});

export const paperBgAddition = style({
  backgroundColor: vars.colors.green[0],
  selectors: {
    [`${darkSelector} &`]: {
      backgroundColor: vars.colors.green[1],
    },
  },
});

export const paperMinHeight = style({
  minHeight: "40px",
});

// Preformatted text styles
export const diffPre = style({
  margin: 0,
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
});

// Placeholder text for added/deleted verses
export const versePlaceholder = style({
  color: "var(--mantine-color-dimmed)",
  textAlign: "center",
  fontSize: "0.875rem",
  fontStyle: "italic",
  paddingTop: "4px",
});

// Diff highlight spans
export const diffHighlightAdded = style({
  backgroundColor: vars.colors.green[4],
  fontWeight: "bold",
});

export const diffHighlightRemoved = style({
  backgroundColor: vars.colors.red[4],
  fontWeight: "bold",
});

// Modal content styles
export const modalScrollPaper = style({
  maxHeight: "90vh",
  overflow: "auto",
});

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
});

// Save button margin
export const saveAllButtonMargin = style({
  marginRight: "0.5rem",
});

// ScrollArea height
export const diffScrollArea = style({
  height: "60vh",
});
