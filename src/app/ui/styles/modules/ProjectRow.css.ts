import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/theme.css.ts";

export const row = style({
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    paddingBlock: "0.15rem",
});

export const projectLink = style({
    flex: 1,
    display: "block",
    padding: "0.35rem 0.5rem",
    borderRadius: vars.radius.md,
    textDecoration: "none",
    color: "inherit",
    selectors: {
        "&:hover": {
            backgroundColor: vars.colors.gray[0],
        },
        "&:focus-visible": {
            outline: `2px solid ${vars.colors.primary.filled}`,
            outlineOffset: 2,
        },
    },
});

export const editRow = style({
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
});

export const editInput = style({
    flex: 1,
});
