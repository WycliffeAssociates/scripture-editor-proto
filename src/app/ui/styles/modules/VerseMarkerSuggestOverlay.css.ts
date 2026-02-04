import { style } from "@vanilla-extract/css";

export const overlayHost = style({
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
});

export const suggestion = style({
    position: "absolute",
    pointerEvents: "auto",
});

export const underline = style({
    position: "absolute",
    left: 0,
    top: 0,
    borderBottom: "2px solid #f08c00",
    width: "100%",
    height: "100%",
});

export const bubble = style({
    position: "absolute",
    left: 0,
    top: "-32px",
});
