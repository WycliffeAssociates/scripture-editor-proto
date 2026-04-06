import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const table = style({
    width: "100%",
    borderCollapse: "collapse",
    fontSize: vars.typography.bodySmall.fontSize,
    color: vars.color.onSurfacePrimary,
});

export const tableStriped = style({
    selectors: {
        "& tbody tr:nth-child(even)": {
            backgroundColor: vars.color.surfaceSecondary,
        },
    },
});

export const tableBordered = style({
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.md,
    selectors: {
        "& th, & td": {
            border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
        },
    },
});

export const tableHead = style({
    backgroundColor: vars.color.surfaceSecondary,
});

export const tableBody = style({
    backgroundColor: vars.color.surfacePrimary,
});

export const tableRow = style({
    selectors: {
        "&:hover": {
            backgroundColor: vars.color.surfaceTertiary,
        },
    },
});

export const tableHeader = style({
    padding: vars.spacing.sm,
    textAlign: "left",
    fontWeight: 600,
    color: vars.color.onSurfaceSecondary,
    borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});

export const tableCell = style({
    padding: vars.spacing.sm,
    borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    verticalAlign: "top",
});
