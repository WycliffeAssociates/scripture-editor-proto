import { style } from "@vanilla-extract/css";

export const editorOuter = style({
    padding: "0.5rem",
});

export const editorContainer = style({
    position: "relative",
});

export const contentEditable = style({
    outline: "none",
    width: "100%",
    padding: "0.5rem",
});

export const contentEditableReference = style({
    outline: "none",
    width: "100%",
    padding: "1rem",
});
