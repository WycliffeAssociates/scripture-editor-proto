import { style } from "@vanilla-extract/css";
import { appHeaderOffsetVar } from "@/app/ui/styles/layoutVars.css.ts";
import { darkSelector, vars, virtualVars } from "../theme.css.ts";

// Main search panel styles
const searchPanel = style({
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    borderRight: `1px solid ${vars.colors.defaultBorder}`,
    height: `calc(100vh - ${appHeaderOffsetVar})`,
    position: "sticky",
    top: appHeaderOffsetVar,
    zIndex: 30,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars.colors.body,
    boxShadow:
        "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    selectors: {
        "&:where([data-dark])": {
            boxShadow: "none",
        },
    },
});

// Header area
const header = style({
    padding:
        "var(--mantine-spacing-md) var(--mantine-spacing-md) var(--mantine-spacing-xs) var(--mantine-spacing-md)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
});

// Controls container
const controls = style({
    width: "100%",
    padding:
        "0 var(--mantine-spacing-md) var(--mantine-spacing-xs) var(--mantine-spacing-md)",
    borderBottom: "1px solid var(--mantine-color-default-border)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--mantine-spacing-md)",
});

// Search input section
const searchInputSection = style({
    display: "flex",
    flexDirection: "column",
    gap: "var(--mantine-spacing-xs)",
});

// Replace section
const replaceSection = style({
    display: "flex",
    flexDirection: "column",
    gap: "calc(var(--mantine-spacing-xs) * 1.5)",
});

// Stats section
const stats = style({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    fontSize: "var(--mantine-font-size-xs)",
    marginTop: "var(--mantine-spacing-xs)",
});

const optionsAccordion = style({
    border: `1px solid ${vars.colors.defaultBorder}`,
    borderRadius: vars.radius.md,
    overflow: "hidden",
    backgroundColor: vars.colors.body,
});

// Mobile drawer content
const drawerContent = style({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
});

// Results container
const resultsContainer = style({
    flex: 1,
    backgroundColor: "inherit",
});

// Results list
const resultsList = style({
    display: "flex",
    flexDirection: "column",
});

// Empty state containers
const emptyState = style({
    padding: "var(--mantine-spacing-xl) var(--mantine-spacing-md)",
    textAlign: "center",
});

const searchingState = style({
    padding: "var(--mantine-spacing-md)",
    textAlign: "center",
});

const noResultsState = style({
    padding: "var(--mantine-spacing-md)",
    textAlign: "center",
});

// Search result item (keeping the existing logic but in vanilla extract)
const searchResult = style({
    backgroundColor: "transparent",
    color: virtualVars.text,
    padding: "var(--mantine-spacing-md)",
    borderBottom: "1px solid var(--mantine-color-default-border)",
    transition: "background 0.15s ease, color 0.15s ease",
    display: "flex",
    flexDirection: "column",
    gap: "calc(var(--mantine-spacing-xs) / 2)",
    cursor: "pointer",
    selectors: {
        "&:hover": {
            backgroundColor: vars.colors.gray[0],
        },
        [`${darkSelector} &:hover`]: {
            backgroundColor: vars.colors.gray[9],
        },
        "&[data-active='true']": {
            backgroundColor: vars.colors.primary[8],
            color: vars.colors.textDark[0],
        },
        "&[data-active='true']:hover": {
            backgroundColor: vars.colors.primary[8],
        },
        "&:focus-visible": {
            outline: "2px solid var(--mantine-primary-color-filled)",
            outlineOffset: "2px",
            position: "relative",
            zIndex: 1,
        },
    },
});

// Result item header
const resultHeader = style({
    display: "block",
    width: "100%",
});

// Result SID (scripture identifier)
const resultSid = style({
    fontWeight: 700,
    fontSize: "var(--mantine-font-size-xs)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
});

// Result arrow icon
const resultArrow = style({
    opacity: 0,
    selectors: {
        [`${searchResult}:hover &`]: {
            opacity: 1,
        },
    },
});

// Result text
const resultText = style({
    fontSize: "var(--mantine-font-size-sm)",
    lineHeight: 1.6,
});

// Search icon in empty state
const searchIcon = style({
    margin: "0 auto var(--mantine-spacing-sm) auto",
    opacity: 0.2,
});
const highlight = style({
    backgroundColor: vars.colors.yellow.filled,
    fontWeight: 700,
});

// Default  to mimic CSS module import
const classes = {
    searchPanel,
    header,
    controls,
    searchInputSection,
    replaceSection,
    stats,
    optionsAccordion,
    drawerContent,
    resultsContainer,
    resultsList,
    emptyState,
    searchingState,
    noResultsState,
    searchResult,
    resultHeader,
    resultSid,
    resultArrow,
    resultText,
    searchIcon,
    highlight,
} as const;

export default classes;
