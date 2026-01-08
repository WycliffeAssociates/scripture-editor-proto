/* Auto-generated vanilla-extract styles for ProjectList component */
import { darken } from "@mantine/core";
import { style } from "@vanilla-extract/css";

const project = style({
    padding: "var(--mantine-spacing-xs) var(--mantine-spacing-md)",
    color: "var(--mantine-primary-color-filled)",
    borderRadius: "var(--mantine-radius-md)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    // hover styles
    vars: {},
    selectors: {
        "&:hover": {
            backgroundColor: "var(--mantine-primary-color-light)",
        },
        "&:focus": {
            outline: "none",
            boxShadow: "0 0 0 3px rgba(0,0,0,0.03)",
        },
    },
});

const picked = style({
    backgroundColor: darken(`var(--mantine-primary-color-light)`, 0.1),
    fontWeight: 700,
});

const projectButton = style({
    background: "none",
    border: "none",
    padding: 0,
    margin: 0,
    textAlign: "left",
    width: "100%",
    display: "block",
    // ensure button looks like plain text but participates in layout
    color: "inherit",
    // ":hover": {
    //   textDecoration: "underline",
    // },
});

const name = style({
    display: "inline-block",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "60ch",
});

const actions = style({
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--mantine-spacing-xs)",
    flexWrap: "nowrap",
    marginLeft: "var(--mantine-spacing-sm)",
});

const iconButton = style({
    background: "transparent",
    border: "none",
    padding: "4px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    borderRadius: "6px",
    selectors: {
        "&:hover": {
            backgroundColor: "rgba(0,0,0,0.03)",
        },
        "&:active": {
            transform: "translateY(1px)",
        },
        "&:focus": {
            outline: "none",
            boxShadow: "0 0 0 3px rgba(0,0,0,0.03)",
        },
    },
});

const newProject = style({
    padding: "var(--mantine-spacing-xs) var(--mantine-spacing-md)",
    color: "var(--mantine-primary-color-filled)",
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    alignItems: "center",
});

/**
 * Default export to mimic CSS module default import shape used in components.
 * This allows `import classnames from "./ProjectList.module.css"` to keep working.
 */
const classes = {
    project,
    picked,
    projectButton,
    name,
    actions,
    iconButton,
    newProject,
} as const;

export default classes;
