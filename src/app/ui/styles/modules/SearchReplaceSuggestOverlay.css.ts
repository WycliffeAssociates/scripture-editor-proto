import { style } from "@vanilla-extract/css";

export const overlayHost = style({
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 60,
});

export const suggestion = style({
    position: "absolute",
    pointerEvents: "auto",
});

export const underline = style({
    position: "absolute",
    left: 0,
    top: 0,
    border: "none",
    borderBottom: "2px dotted var(--mantine-primary-color-6)",
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            borderBottomColor: "var(--mantine-primary-color-5)",
        },
    },
});

export const bubble = style({
    position: "absolute",
    left: "50%",
    transform: "translateY(-100%)",
});

export const bubbleShell = style({
    display: "inline-flex",
    alignItems: "center",
    overflow: "hidden",
    borderRadius: 9999,
    border: "1px solid var(--mantine-primary-color-6)",
    background: "var(--mantine-color-body)",
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.14)",
    padding: 0,
    margin: 0,
    minWidth: 0,
    selectors: {
        '[data-mantine-color-scheme="dark"] &': {
            boxShadow: "0 10px 22px rgba(0, 0, 0, 0.45)",
        },
    },
});

export const bubbleLabel = style({
    padding: "8px 14px 8px 16px",
    fontSize: "13px",
    lineHeight: 1.2,
    fontWeight: 500,
    color: "var(--mantine-color-text)",
    whiteSpace: "nowrap",
});

export const bubbleAction = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 32,
    border: "none",
    borderLeft: "1px solid var(--mantine-primary-color-5)",
    background: "var(--mantine-primary-color-filled)",
    color: "var(--mantine-primary-color-contrast)",
    cursor: "pointer",
    selectors: {
        "&:hover": {
            background: "var(--mantine-primary-color-filled-hover)",
        },
    },
});
