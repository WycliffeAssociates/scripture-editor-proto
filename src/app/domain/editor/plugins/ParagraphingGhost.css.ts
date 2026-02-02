import { rem } from "@mantine/core";
import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/theme.css.ts";

export const ghostMarker = style({
    position: "fixed",
    pointerEvents: "none",
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    marginLeft: rem(1),
    padding: `${rem(2)} ${rem(6)}`,
    borderRadius: vars.radius.sm,
    border: `1px solid ${vars.colors.gray[3]}`,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    color: vars.colors.dark[7],
    fontFamily: "var(--mantine-font-family-monospace)",
    fontSize: rem(12),
    whiteSpace: "normal",
    maxWidth: rem(200),
    lineHeight: 1.1,
    boxShadow: "0 6px 18px rgba(0, 0, 0, 0.12)",
    transform: "translateY(-100%)",
    marginTop: rem(-4),
    selectors: {
        "[data-mantine-color-scheme='dark'] &": {
            backgroundColor: "rgba(15, 15, 15, 0.92)",
            color: vars.colors.gray[0],
            borderColor: vars.colors.dark[4],
            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.6)",
        },
    },
});

export const ghostMarkerType = style({
    fontWeight: 700,
    marginLeft: rem(8),
    padding: `0 ${rem(4)}`,
    borderRadius: vars.radius.xs,
    backgroundColor: vars.colors.gray[2],
    color: vars.colors.gray[7],
    fontSize: rem(10),
    selectors: {
        "[data-mantine-color-scheme='dark'] &": {
            backgroundColor: vars.colors.dark[6],
            color: vars.colors.gray[2],
        },
    },
});

export const ghostMarkerLabel = style({
    fontWeight: 700,
    color: vars.colors.blue[7],
    fontSize: rem(11),
    selectors: {
        "[data-mantine-color-scheme='dark'] &": {
            color: vars.colors.blue[3],
        },
    },
});

export const progressPanel = style({
    position: "fixed",
    top: rem(80),
    right: rem(16),
    zIndex: 9990,
    opacity: 0.95,
    pointerEvents: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: rem(6),
});

export const exitControls = style({
    pointerEvents: "auto",
});

export const mobileControls = style({
    position: "fixed",
    bottom: rem(32),
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    display: "flex",
    gap: rem(16),
    alignItems: "center",
});
