import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

export const popover = style({
    width: "min(30rem, calc(100vw - 1.5rem))",
    padding: vars.spacing.md,
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.sm,
    backgroundColor: vars.color.surfacePrimary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.lg,
    boxShadow: vars.shadow.medium,
});

export const heading = style({
    margin: 0,
    fontSize: vars.typography.bodyNormal.fontSize,
    fontWeight: 700,
    color: vars.color.onSurfacePrimary,
});

export const body = style({
    margin: 0,
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: vars.typography.bodySmall.lineHeight,
    color: vars.color.onSurfaceSecondary,
});

export const statusMeta = style({
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    columnGap: vars.spacing.sm,
    rowGap: vars.spacing.xs,
    fontSize: vars.typography.bodySmallest.fontSize,
    color: vars.color.onSurfaceSecondary,
});

export const statusMetaLabel = style({
    fontWeight: 600,
    color: vars.color.onSurfacePrimary,
});

export const statusMetaTimestamp = style({
    fontWeight: 700,
    color: vars.color.brandBase,
});

export const actionsRow = style({
    display: "flex",
    gap: vars.spacing.sm,
    alignItems: "center",
    flexWrap: "wrap",
});

export const section = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.sm,
});

export const signedIn = style({
    margin: 0,
    fontSize: vars.typography.bodySmall.fontSize,
    color: vars.color.onSurfaceSecondary,
});

export const fieldGroup = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
});

export const label = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    color: vars.color.onSurfaceSecondary,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
});

export const input = style({
    height: "2.25rem",
    borderRadius: vars.border.radius.md,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    padding: `0 ${vars.spacing.sm}`,
    fontSize: vars.typography.bodySmall.fontSize,
    color: vars.color.onSurfacePrimary,
    backgroundColor: vars.color.surfaceSecondary,
    selectors: {
        "&:focus": {
            outline: "none",
            borderColor: vars.color.brandBase,
            boxShadow: `0 0 0 2px ${vars.color.brandLight}`,
        },
    },
});

export const comboboxValue = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
});

export const comboboxTrigger = style([
    input,
    {
        width: "100%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: vars.spacing.xs,
        cursor: "pointer",
    },
]);

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
    maxHeight: "12rem",
});

export const comboboxScrollViewport = style({
    maxHeight: "12rem",
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
    // Highlight with a brand outline on the white surface rather than a filled
    // row, so it reads as "this is where your click lands" (box-shadow keeps the
    // row from shifting on hover).
    boxShadow: "inset 0 0 0 1px transparent",
    selectors: {
        "&:hover": {
            boxShadow: `inset 0 0 0 1px ${vars.color.brandBase}`,
        },
        "&[data-highlighted]": {
            boxShadow: `inset 0 0 0 1px ${vars.color.brandBase}`,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
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

/** Owner suffix on a project row — muted context, not the primary label. */
export const comboboxItemOwner = style({
    color: vars.color.onSurfaceTertiary,
    fontWeight: 400,
});

export const comboboxEmpty = style({
    padding: `${vars.spacing.sm} ${vars.spacing.xs}`,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    color: vars.color.onSurfaceSecondary,
    backgroundColor: vars.color.surfacePrimary,
});

export const comboboxLinkFooter = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
    padding: `${vars.spacing.sm} ${vars.spacing.xs}`,
    borderTop: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    color: vars.color.onSurfaceSecondary,
});

export const settingsDisclosureButton = style({
    appearance: "none",
    border: "none",
    background: "transparent",
    padding: `${vars.spacing.xs} 0`,
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    cursor: "pointer",
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    selectors: {
        "&:hover": {
            color: vars.color.onSurfacePrimary,
        },
    },
});

export const settingsDisclosureChevron = style({
    display: "inline-flex",
    alignItems: "center",
    transition: "transform 120ms ease",
});

export const settingsDisclosureChevronOpen = style({
    transform: "rotate(90deg)",
});

export const settingsList = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
    paddingTop: vars.spacing.xs,
});

export const settingRow = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.spacing.sm,
});

export const settingRowLabelGroup = style({
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    minWidth: 0,
});

export const settingRowTitle = style({
    fontSize: vars.typography.bodySmall.fontSize,
    color: vars.color.onSurfacePrimary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
});

export const infoIconButton = style({
    appearance: "none",
    border: "none",
    background: "transparent",
    padding: "0.25rem",
    margin: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars.color.onSurfaceTertiary,
    cursor: "help",
    borderRadius: vars.border.radius.full,
    lineHeight: 0,
    selectors: {
        "&:hover, &:focus-visible": {
            color: vars.color.brandBase,
            backgroundColor: vars.color.surfaceSecondary,
            outline: "none",
        },
    },
});

globalStyle(`${infoIconButton} svg`, {
    pointerEvents: "none",
});

export const tooltipPopup = style({
    backgroundColor: vars.color.surfaceInvert,
    color: vars.color.onSurfaceInvert,
    borderRadius: vars.border.radius.sm,
    padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 500,
    lineHeight: 1.35,
    boxShadow: vars.shadow.medium,
    maxWidth: "18rem",
    zIndex: zLayer.cloudTooltipPopup,
});

const indeterminate = keyframes({
    "0%": { transform: "translateX(-60%)" },
    "100%": { transform: "translateX(130%)" },
});

export const progressTrack = style({
    height: "0.375rem",
    borderRadius: vars.border.radius.full,
    backgroundColor: vars.color.surfaceSecondary,
    overflow: "hidden",
    position: "relative",
});

export const progressBar = style({
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "55%",
    borderRadius: vars.border.radius.full,
    backgroundColor: vars.color.brandBase,
    animation: `${indeterminate} 1.2s ease-in-out infinite`,
});
