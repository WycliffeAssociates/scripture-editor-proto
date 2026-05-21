import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const referencePicker = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
    borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    backgroundColor: vars.color.surfaceSecondary,
});

export const referencePickerSelect = style({
    flex: 1,
    minWidth: "12rem",
});

export const referencePickerInfo = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    fontSize: vars.typography.bodySmallest.fontSize,
    color: vars.color.onSurfaceSecondary,
    whiteSpace: "nowrap",
});

export const comboboxTrigger = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.spacing.xs,
    width: "100%",
    minWidth: "12rem",
    minHeight: "1.875rem",
    padding: `0 ${vars.spacing.sm}`,
    backgroundColor: vars.color.surfacePrimary,
    color: vars.color.onSurfacePrimary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.sm,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    cursor: "pointer",
    selectors: {
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.brandLight}`,
        },
    },
});

export const comboboxValue = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "left",
});

export const comboboxChevron = style({
    flex: "0 0 auto",
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: 1,
});

export const comboboxPopup = style({
    backgroundColor: vars.color.surfacePrimary,
    borderRadius: vars.border.radius.sm,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    boxShadow: vars.shadow.large,
    padding: "0.125rem",
    width: "min(24rem, calc(100vw - 2rem))",
    pointerEvents: "auto",
    overflow: "hidden",
    zIndex: 1000,
});

export const comboboxHeader = style({
    padding: "0.125rem",
    borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});

export const comboboxInput = style({
    width: "100%",
    minHeight: "1.875rem",
    border: "none",
    outline: "none",
    backgroundColor: "transparent",
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    padding: `0 ${vars.spacing.xs}`,
});

export const comboboxScrollArea = style({
    maxHeight: "16rem",
});

export const comboboxScrollViewport = style({
    maxHeight: "16rem",
});

export const comboboxList = style({
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    padding: "0.125rem",
});

export const comboboxItem = style({
    appearance: "none",
    border: "none",
    backgroundColor: "transparent",
    borderRadius: vars.border.radius.sm,
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 500,
    textAlign: "left",
    lineHeight: 1.2,
    padding: `0.1875rem ${vars.spacing.xs}`,
    minHeight: "1.375rem",
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "0.875rem minmax(0, 1fr)",
    alignItems: "center",
    gap: "0.25rem",
    width: "100%",
    selectors: {
        "&:hover": {
            backgroundColor: vars.button.tertiary.surfaceHover,
        },
        "&[data-highlighted]": {
            backgroundColor: vars.button.tertiary.surfaceHover,
        },
    },
});

export const comboboxItemIndicator = style({
    width: "0.875rem",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars.color.brandBase,
});

export const comboboxEmpty = style({
    padding: `${vars.spacing.sm} ${vars.spacing.xs}`,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    color: vars.color.onSurfaceSecondary,
    backgroundColor: vars.color.surfacePrimary,
});
