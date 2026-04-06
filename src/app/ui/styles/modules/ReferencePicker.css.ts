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
