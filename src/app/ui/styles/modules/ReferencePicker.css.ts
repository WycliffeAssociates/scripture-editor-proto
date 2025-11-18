import { darken } from "@mantine/core";
import { style } from "@vanilla-extract/css";
import { vars, virtualVars } from "@/app/ui/styles/theme.css.ts";

// Popover Dropdown Container
export const dropdown = style({
  display: "flex",
  flexDirection: "column",
  height: "400px",
  overflowY: "hidden", // Let the specific parts scroll if needed, or outer
});

// Search Input
export const searchInput = style({
  borderBottom: `1px solid ${virtualVars.border}`,
  flexShrink: 0,
});

// Trigger Button (Desktop)
export const triggerButton = style({
  width: "250px",
  justifyContent: "space-between",
});

export const triggerInner = style({
  justifyContent: "space-between",
  width: "100%",
});

export const triggerLabel = style({
  fontWeight: 500,
});

// Accordion Styles
export const accordionItem = style({
  // selectors: {
  //   "&:last-of-type": {
  //     borderBottom: "none",
  //   },
  // },
});

export const accordionControl = style({
  padding: "0.5rem 1rem",
  cursor: "pointer",
  fontSize: "0.9rem",
  transition: "background-color 0.2s ease",
  selectors: {
    "&:hover": {
      backgroundColor: darken(virtualVars.surface, 0.05),
    },
  },
});

export const activeChapter = style({
  backgroundColor: "var(--mantine-primary-color-filled)",
  fontWeight: 600,
  selectors: {
    "&:hover": {
      backgroundColor: "var(--mantine-primary-color-filled)",
    },
  },
});

// State: When the book is the one currently selected
export const activeBookControl = style({
  backgroundColor: darken(virtualVars.surface, 0.1),
  fontWeight: 600,
  selectors: {
    "&:hover": {
      backgroundColor: darken(virtualVars.surface, 0.1),
    },
  },
});

export const accordionContent = style({
  padding: "0.5rem",
});

// Grid for Chapters
export const chapterGrid = style({
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  padding: "0.5rem",
});
