import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

export const host = style({
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: zLayer.lintDomOverlay,
});

// Fallback affordance: the `!` badge, used when the flagged token isn't
// rendered as visible text in the current mode (e.g. a USFM marker hidden in
// regular/view mode). Anchored at the next-best visible spot.
export const item = style({
    position: "absolute",
    width: "1rem",
    height: "1rem",
    pointerEvents: "auto",
    borderRadius: vars.border.radius.full,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: `color-mix(in srgb, ${vars.color.surfaceError} 88%, ${vars.color.surfacePrimary})`,
    color: vars.color.onSurfaceError,
    boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, inset 0 0 0 1px color-mix(in srgb, ${vars.color.onSurfaceError} 35%, transparent), ${vars.shadow.small}`,
    cursor: "pointer",
    // Translucent so it stays legible when it sits over a verse number.
    opacity: 0.8,
    transition: "opacity 120ms ease, transform 120ms ease",
    selectors: {
        "&::before": {
            content: '"!"',
            fontSize: vars.typography.bodySmallest.fontSize,
            lineHeight: 1,
            fontWeight: 800,
        },
        "&:hover": {
            opacity: 1,
            transform: "scale(1.06)",
        },
    },
});

// Preferred affordance: a translucent highlight drawn over the offending
// token's own rendered text (one box per client rect, so multi-line runs are
// covered). Used whenever the flagged token is visible text.
//
// CRITICAL: click-through. The box overlays editable text, so it MUST NOT
// capture pointer events — otherwise you can't click into the verse to place
// the cursor or select. Hover/popover is driven off the underlying token
// (which carries `data-lint-hitpoint`), not this box.
export const highlight = style({
    position: "absolute",
    pointerEvents: "none",
    borderRadius: vars.border.radius.xs,
    backgroundColor: `color-mix(in srgb, ${vars.color.onSurfaceError} 16%, transparent)`,
    opacity: 0.8,
});
