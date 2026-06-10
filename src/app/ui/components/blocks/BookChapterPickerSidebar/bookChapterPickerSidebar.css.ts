import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

const railSurface = vars.color.appSidebarSurfaceHover;
const railSurfaceHover = vars.color.appSidebarSurfaceHover;
const railBorder = vars.color.appSidebarBorder;
const railText = vars.color.appSidebarOnSurface;
const railTextStrong = vars.color.appSidebarOnSurface;
const railTextMuted = vars.color.appSidebarOnSurfaceMuted;

export const shell = style({
    minHeight: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
});

export const findButton = style({
    flex: "0 0 auto",
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    minHeight: "2.5rem",
    marginBottom: vars.spacing.sm,
    paddingInline: vars.spacing.md,
    paddingBlock: vars.spacing.sm,
    borderRadius: vars.border.radius.md,
    border: `${vars.border.width.thin} solid ${railBorder}`,
    backgroundColor: railSurface,
    color: railTextMuted,
    fontSize: vars.typography.bodySmall.fontSize,
    fontWeight: 600,
    textAlign: "left",
    cursor: "pointer",
    transition: "background-color 140ms ease, color 140ms ease",
    selectors: {
        "&:hover": {
            backgroundColor: railSurfaceHover,
            color: railTextStrong,
        },
        "&:focus-visible": {
            outline: `2px solid ${vars.color.brandBase}`,
            outlineOffset: 2,
        },
    },
});

export const findButtonIcon = style({
    flexShrink: 0,
});

export const viewport = style({
    position: "relative",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
});

export const panel = style({
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    transition:
        "transform 180ms cubic-bezier(0.2, 0, 0, 1), opacity 180ms cubic-bezier(0.2, 0, 0, 1)",
});

export const panelVisible = style({
    opacity: 1,
    transform: "translateX(0)",
    pointerEvents: "auto",
});

export const panelHiddenLeft = style({
    opacity: 0,
    transform: "translateX(-0.75rem)",
    pointerEvents: "none",
});

export const panelHiddenRight = style({
    opacity: 0,
    transform: "translateX(0.75rem)",
    pointerEvents: "none",
});

export const scrollAreaRoot = style({
    minHeight: 0,
    height: "100%",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: vars.spacing.xs,
});

export const scrollAreaViewport = style({
    minHeight: 0,
    height: "100%",
    overflow: "hidden",
});

export const scrollAreaContent = style({
    minHeight: "100%",
    paddingRight: vars.spacing.xs,
});

export const scrollAreaScrollbar = style({
    width: "0.5rem",
    display: "flex",
    justifyContent: "center",
    paddingBlock: vars.spacing.xs,
});

export const scrollAreaThumb = style({
    width: "0.25rem",
    borderRadius: vars.border.radius.full,
    backgroundColor: "color-mix(in srgb, white 26%, transparent)",
    transition: "background-color 140ms ease",
    selectors: {
        [`${scrollAreaScrollbar}:hover &`]: {
            backgroundColor: "color-mix(in srgb, white 38%, transparent)",
        },
    },
});

export const bookList = style({
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
});

export const rowBase = style({
    display: "flex",
    alignItems: "center",
    width: "100%",
    minHeight: "3rem",
    padding: `${vars.spacing.sm} ${vars.spacing.md}`,
    border: "1px solid transparent",
    borderRadius: vars.border.radius.lg,
    backgroundColor: "transparent",
    color: railText,
    cursor: "pointer",
    textAlign: "left",
    transition:
        "background-color 140ms ease, color 140ms ease, border-color 140ms ease",
    selectors: {
        "&:hover": {
            backgroundColor: railSurfaceHover,
            color: railTextStrong,
        },
        "&:focus-visible": {
            outline: `${vars.border.width.thick} solid ${vars.color.brandLight}`,
            outlineOffset: 2,
        },
    },
});

export const bookRow = style([
    rowBase,
    {
        justifyContent: "space-between",
        gap: vars.spacing.sm,
    },
]);

export const bookRowActive = style({
    backgroundColor: vars.color.brandBase,
    borderColor: vars.color.brandBase,
    color: railTextStrong,
});

export const bookRowLead = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    minWidth: 0,
});

export const bookIcon = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
});

export const bookTitle = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.typography.bodySmall.fontSize,
    fontWeight: 600,
    lineHeight: vars.typography.bodySmall.lineHeight,
});

export const chevron = style({
    flexShrink: 0,
    opacity: 0.7,
});

export const chapterHeader = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    paddingBottom: vars.spacing.sm,
    marginBottom: vars.spacing.xs,
    borderBottom: `1px solid ${railBorder}`,
});

export const backButton = style({
    width: "2rem",
    height: "2rem",
    border: `1px solid ${railBorder}`,
    borderRadius: vars.border.radius.full,
    backgroundColor: railSurface,
    color: railTextStrong,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    selectors: {
        "&:hover": {
            backgroundColor: railSurfaceHover,
        },
    },
});

export const chapterHeaderText = style({
    minWidth: 0,
});

export const chapterHeaderTitle = style({
    fontSize: vars.typography.bodyNormal.fontSize,
    fontWeight: 700,
    lineHeight: vars.typography.bodyNormal.lineHeight,
    color: railTextStrong,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
});

export const chapterHeaderMeta = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    color: railTextMuted,
});

export const chapterList = style({
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
});

export const chapterRow = style([
    rowBase,
    {
        justifyContent: "flex-start",
        gap: vars.spacing.sm,
    },
]);

export const chapterRowActive = style({
    backgroundColor: vars.color.brandBase,
    borderColor: vars.color.brandBase,
    color: railTextStrong,
});

export const chapterRowBook = style({
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.typography.bodySmall.fontSize,
    fontWeight: 600,
});

export const chapterRowNumber = style({
    flexShrink: 0,
    fontSize: vars.typography.bodySmall.fontSize,
    fontWeight: 700,
    color: railTextMuted,
});

export const emptyState = style({
    minHeight: "8rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: railTextMuted,
    fontSize: vars.typography.bodySmall.fontSize,
});
