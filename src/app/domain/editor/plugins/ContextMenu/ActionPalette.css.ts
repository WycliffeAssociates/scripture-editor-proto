import { rem } from "@mantine/core";
import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/theme.css.ts";

export const container = style({
    width: rem(480), // 30rem
    maxWidth: "95vw",
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars.colors.body,
    borderRadius: vars.radius.lg,
    boxShadow: `0 10px 30px color-mix(in srgb, ${vars.colors.black} 20%, transparent)`,
    overflow: "hidden",
    border: `1px solid ${vars.colors.defaultBorder}`,
    "@media": {
        "screen and (max-width: 480px)": {
            width: "95vw",
        },
    },
    selectors: {
        "[data-mantine-color-scheme='dark'] &": {
            backgroundColor: vars.colors.dark[6],
            borderColor: vars.colors.dark[4],
            boxShadow: `0 20px 50px color-mix(in srgb, ${vars.colors.black} 50%, transparent)`,
        },
    },
});

export const searchInput = style({
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    padding: `${rem(14)} ${rem(16)}`,
    fontSize: rem(16),
    color: vars.colors.text,
    ":focus": {
        outline: "none",
    },
});

export const header = style({
    padding: `${rem(4)} ${rem(8)}`,
    borderBottom: `1px solid ${vars.colors.defaultBorder}`,
    backgroundColor: "transparent",
    display: "flex",
    alignItems: "center",
    gap: rem(8),
});

export const scrollArea = style({
    maxHeight: rem(400),
});

export const item = style({
    padding: `${rem(10)} ${rem(16)}`,
    margin: `${rem(2)} ${rem(8)}`,
    borderRadius: vars.radius.md,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: rem(12),
    transition: "all 0.1s ease",
    color: vars.colors.text,
    selectors: {
        "&[data-combobox-selected]": {
            backgroundColor: vars.colors.primary[6],
            color: vars.colors.white,
        },
        "&:hover:not([data-combobox-selected])": {
            backgroundColor: vars.colors.gray[1],
        },
        "[data-mantine-color-scheme='dark'] &[data-combobox-selected]": {
            backgroundColor: vars.colors.primary[5],
        },
    },
});

export const categoryHeader = style({
    padding: `${rem(8)} ${rem(16)} ${rem(4)}`,
    fontSize: rem(11),
    fontWeight: 700,
    textTransform: "uppercase",
    color: vars.colors.dimmed,
    letterSpacing: rem(0.5),
});

export const pillContainer = style({
    padding: rem(8),
    display: "flex",
    alignItems: "center",
    gap: rem(4),
    borderBottom: `1px solid ${vars.colors.defaultBorder}`,
});
