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
    boxShadow: `0 20px 25px -5px color-mix(in srgb, ${vars.colors.black} 10%, transparent), 0 10px 10px -5px color-mix(in srgb, ${vars.colors.black} 4%, transparent)`,
    selectors: {
        "&:where([data-dark])": {
            boxShadow: "none",
        },
    },
});

const resultsHeader = style({
    padding: `${vars.spacing.xs} ${vars.spacing.md}`,
    backgroundColor: vars.colors.primary.filled,
    color: vars.colors.white,
    borderBottom: `1px solid ${vars.colors.defaultBorder}`,
});

const popoverDropdown = style({
    width: "min(48rem, calc(100vw - 2rem))",
    border: `1px solid ${vars.colors.defaultBorder}`,
    borderRadius: vars.radius.md,
    backgroundColor: vars.colors.body,
    padding: 0,
});

const popoverHeader = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `calc(${vars.spacing.xs} * 0.5) ${vars.spacing.xs} 0 ${vars.spacing.xs}`,
});

const popoverHeaderInfo = style({
    display: "flex",
    flexDirection: "column",
    gap: `calc(${vars.spacing.xs} * 0.25)`,
    minWidth: 0,
});

const popoverHelpText = style({
    color: vars.colors.gray[6],
    fontSize: vars.fontSizes.xs,
    lineHeight: 1.15,
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    overflow: "hidden",
});

// Controls container
const controls = style({
    width: "100%",
    padding: `0 ${vars.spacing.xs} ${vars.spacing.xs} ${vars.spacing.xs}`,
    borderBottom: `1px solid ${vars.colors.defaultBorder}`,
    display: "flex",
    flexDirection: "column",
    gap: `calc(${vars.spacing.xs} * 0.75)`,
    "@media": {
        "screen and (max-width: 48em)": {
            padding: `${vars.spacing.xs} 0 ${vars.spacing.xs}`,
            gap: vars.spacing.xs,
        },
    },
});

const compactLayout = style({
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: vars.spacing.xs,
    alignItems: "start",
    "@media": {
        "screen and (max-width: 48em)": {
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: vars.spacing.xs,
        },
    },
});

const inputStack = style({
    display: "flex",
    flexDirection: "column",
    gap: `calc(${vars.spacing.xs} * 0.75)`,
    minWidth: 0,
});

const controlRail = style({
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: `calc(${vars.spacing.xs} * 0.6)`,
    minWidth: "13rem",
    "@media": {
        "screen and (max-width: 48em)": {
            alignItems: "stretch",
            minWidth: 0,
            width: "100%",
        },
    },
});

const statsAndNavRow = style({
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: `calc(${vars.spacing.xs} * 0.5)`,
    "@media": {
        "screen and (max-width: 48em)": {
            justifyContent: "space-between",
        },
    },
});

const filterIconsRow = style({
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: `calc(${vars.spacing.xs} * 0.5)`,
    "@media": {
        "screen and (max-width: 48em)": {
            justifyContent: "flex-start",
        },
    },
});

const statsText = style({
    fontSize: vars.fontSizes.md,
    color: vars.colors.gray[6],
    whiteSpace: "nowrap",
});

const sortBadgeRow = style({
    minHeight: `calc(${vars.fontSizes.md} + ${vars.spacing.xs})`,
});

const buttonStack = style({
    display: "flex",
    flexDirection: "column",
    gap: `calc(${vars.spacing.xs} * 0.75)`,
    "@media": {
        "screen and (max-width: 48em)": {
            gap: vars.spacing.xs,
        },
    },
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
    padding: `${vars.spacing.xl} ${vars.spacing.md}`,
    textAlign: "center",
});

const searchingState = style({
    padding: vars.spacing.md,
    textAlign: "center",
});

const noResultsState = style({
    padding: vars.spacing.md,
    textAlign: "center",
});

// Search result item (keeping the existing logic but in vanilla extract)
const searchResult = style({
    backgroundColor: "transparent",
    color: virtualVars.text,
    padding: vars.spacing.md,
    borderBottom: `1px solid ${vars.colors.defaultBorder}`,
    transition: "background 0.15s ease, color 0.15s ease",
    display: "flex",
    flexDirection: "column",
    gap: `calc(${vars.spacing.xs} / 2)`,
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
            outline: `2px solid ${vars.colors.primary.filled}`,
            outlineOffset: `calc(${vars.spacing.xs} * 0.25)`,
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

const resultSource = style({
    display: "inline-block",
    marginRight: vars.spacing.xs,
    padding: `0 calc(${vars.spacing.xs} * 0.5)`,
    borderRadius: vars.radius.xs,
    fontSize: vars.fontSizes.xs,
    fontWeight: 700,
    textTransform: "uppercase",
    color: vars.colors.gray[7],
    backgroundColor: vars.colors.gray[1],
    selectors: {
        [`${darkSelector} &`]: {
            color: vars.colors.gray[2],
            backgroundColor: vars.colors.gray[8],
        },
    },
});

// Result SID (scripture identifier)
const resultSid = style({
    fontWeight: 700,
    fontSize: vars.fontSizes.xs,
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
    fontSize: vars.fontSizes.sm,
    lineHeight: 1.6,
});

const resultPair = style({
    display: "flex",
    flexDirection: "column",
    gap: `calc(${vars.spacing.xs} * 0.6)`,
});

const resultPairBlock = style({
    display: "flex",
    flexDirection: "column",
    gap: `calc(${vars.spacing.xs} * 0.3)`,
});

const resultProjectLabel = style({
    fontSize: `calc(${vars.fontSizes.xs} * 0.92)`,
    lineHeight: 1.1,
    fontWeight: 600,
    color: vars.colors.gray[6],
});

// Search icon in empty state
const searchIcon = style({
    margin: `0 auto ${vars.spacing.sm} auto`,
    opacity: 0.2,
});
const highlight = style({
    backgroundColor: vars.colors.yellow.filled,
    fontWeight: 700,
});

const activeHighlight = style({
    backgroundColor: vars.colors.orange[4],
    color: vars.colors.black,
    fontWeight: 800,
    borderRadius: vars.radius.xs,
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.orange[7],
            color: vars.colors.white,
        },
    },
});

// Default  to mimic CSS module import
const classes = {
    searchPanel,
    resultsHeader,
    popoverDropdown,
    popoverHeader,
    popoverHeaderInfo,
    popoverHelpText,
    controls,
    compactLayout,
    inputStack,
    controlRail,
    statsAndNavRow,
    filterIconsRow,
    statsText,
    sortBadgeRow,
    buttonStack,
    drawerContent,
    resultsContainer,
    resultsList,
    emptyState,
    searchingState,
    noResultsState,
    searchResult,
    resultHeader,
    resultSource,
    resultSid,
    resultArrow,
    resultText,
    resultPair,
    resultPairBlock,
    resultProjectLabel,
    searchIcon,
    highlight,
    activeHighlight,
} as const;

export default classes;
