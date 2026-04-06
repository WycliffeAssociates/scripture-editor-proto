import { style } from "@vanilla-extract/css";
import * as selectStyles from "@/app/ui/components/primitives/Select/select.css.ts";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
    width: "100%",
});

export const trigger = style({
    width: "100%",
    minHeight: "4.5rem",
    padding: vars.spacing.md,
    border: `1px solid ${vars.color.appSidebarBorder}`,
    borderRadius: vars.border.radius.lg,
    backgroundColor: vars.color.appSidebarSurfaceHover,
    color: vars.color.appSidebarOnSurface,
    textAlign: "left",
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: vars.spacing.sm,
    alignItems: "center",
    selectors: {
        "&:hover": {
            backgroundColor: vars.color.appSidebarSurfaceActive,
        },
        "&:focus-visible": {
            outline: `${vars.border.width.thick} solid ${vars.color.brandBase}`,
            outlineOffset: "2px",
        },
        "&[data-popup-open]": {
            backgroundColor: vars.color.appSidebarSurfaceActive,
            borderColor: vars.color.brandBase,
        },
        "&:disabled": {
            cursor: "not-allowed",
            opacity: 0.7,
        },
    },
});

export const triggerText = style({
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
});

export const triggerKicker = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: vars.color.appSidebarOnSurfaceMuted,
});

export const triggerTitle = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.typography.bodyNormal.fontSize,
    lineHeight: vars.typography.bodyNormal.lineHeight,
    fontWeight: 700,
    color: vars.color.appSidebarOnSurface,
});

export const triggerSubtitle = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    color: vars.color.appSidebarOnSurfaceMuted,
});

export const triggerChevron = style({
    width: "1.25rem",
    height: "1.25rem",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars.color.appSidebarOnSurfaceMuted,
    flexShrink: 0,
});

export const popup = style({
    minWidth: "var(--anchor-width)",
    width: "min(28rem, var(--anchor-width))",
    backgroundColor: vars.color.surfacePrimary,
    border: `1px solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.lg,
    boxShadow: vars.shadow.large,
    overflow: "hidden",
    zIndex: 1000,
});

export const popupHeader = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.sm,
    padding: vars.spacing.md,
    borderBottom: `1px solid ${vars.color.surfaceBorder}`,
});

export const popupTitle = style({
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: vars.typography.bodySmall.lineHeight,
    fontWeight: 700,
    color: vars.color.onSurfacePrimary,
});

export const searchInput = style({
    width: "100%",
    minHeight: "2.75rem",
    borderRadius: vars.border.radius.md,
    border: `1px solid ${vars.color.surfaceBorder}`,
    padding: `0 ${vars.spacing.md}`,
    backgroundColor: vars.color.surfacePrimary,
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: vars.typography.bodySmall.lineHeight,
    selectors: {
        "&:focus": {
            outline: `${vars.border.width.thick} solid ${vars.color.brandBase}`,
            outlineOffset: "1px",
        },
        "&::placeholder": {
            color: vars.color.onSurfaceTertiary,
        },
    },
});

export const scrollArea = style({
    maxHeight: "24rem",
});

export const scrollViewport = style({
    maxHeight: "24rem",
});

export const list = style({
    paddingBlock: vars.spacing.xs,
});

export const item = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    padding: `${vars.spacing.sm} ${vars.spacing.md}`,
    marginInline: vars.spacing.xs,
    borderRadius: vars.border.radius.md,
    cursor: "pointer",
    color: vars.color.onSurfacePrimary,
    selectors: {
        "&[data-highlighted]": {
            backgroundColor: vars.color.surfaceSecondary,
        },
        "&[data-selected]": {
            color: vars.color.brandBase,
            backgroundColor: vars.color.brandLight,
        },
        "&[data-disabled]": {
            opacity: 0.45,
            cursor: "not-allowed",
        },
    },
});

export const itemTextBlock = style({
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    flex: "1 1 auto",
});

export const itemTitle = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: vars.typography.bodySmall.lineHeight,
    fontWeight: 600,
});

export const itemMeta = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    color: vars.color.onSurfaceTertiary,
    selectors: {
        [`${item}[data-selected] &`]: {
            color: vars.color.brandDark,
        },
    },
});

export const emptyState = style({
    padding: vars.spacing.lg,
    textAlign: "center",
    color: vars.color.onSurfaceTertiary,
    fontSize: vars.typography.bodySmall.fontSize,
});

export const radioCircle = selectStyles.radioCircle;
export const radioCheck = selectStyles.radioCheck;
export const itemIndicatorLeading = selectStyles.itemIndicatorLeading;
