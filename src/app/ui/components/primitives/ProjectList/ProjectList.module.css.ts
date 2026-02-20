/* Auto-generated vanilla-extract styles for ProjectList component */
import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/theme.css.ts";

const project = style({
    padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
    color: vars.colors.primary.filled,
    borderRadius: vars.radius.md,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    // hover styles
    vars: {},
    selectors: {
        "&:hover": {
            backgroundColor: vars.colors.primary[0],
        },
        "&:focus": {
            outline: "none",
            boxShadow: `0 0 0 3px ${vars.colors.primary[1]}`,
        },
    },
});

const picked = style({
    backgroundColor: vars.colors.primary[1],
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
    gap: vars.spacing.xs,
    flexWrap: "nowrap",
    marginLeft: vars.spacing.sm,
});

const iconButton = style({
    background: "transparent",
    border: "none",
    padding: vars.spacing.xs,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    borderRadius: vars.radius.sm,
    selectors: {
        "&:hover": {
            backgroundColor: vars.colors.gray[1],
        },
        "&:active": {
            transform: "translateY(1px)",
        },
        "&:focus": {
            outline: "none",
            boxShadow: `0 0 0 3px ${vars.colors.primary[1]}`,
        },
    },
});

const newProject = style({
    padding: `${vars.spacing.xs} ${vars.spacing.md}`,
    color: vars.colors.primary.filled,
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    alignItems: "center",
});

const languageLabel = style({
    paddingTop: `calc(${vars.spacing.xs} * 0.25)`,
    paddingBottom: `calc(${vars.spacing.xs} * 0.25)`,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
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
    languageLabel,
} as const;

export default classes;
