import { fontFace } from "@vanilla-extract/css";

// CharisSIL font family with 4 variants
export const charisSIL = fontFace([
  {
    src: 'url("/fonts/CharisSIL-Regular.woff2") format("woff2")',
    fontWeight: "400",
    fontStyle: "normal",
    fontDisplay: "swap",
  },
  {
    src: 'url("/fonts/CharisSIL-Italic.woff2") format("woff2")',
    fontWeight: "400",
    fontStyle: "italic",
    fontDisplay: "swap",
  },
  {
    src: 'url("/fonts/CharisSIL-Bold.woff2") format("woff2")',
    fontWeight: "700",
    fontStyle: "normal",
    fontDisplay: "swap",
  },
  {
    src: 'url("/fonts/CharisSIL-BoldItalic.woff2") format("woff2")',
    fontWeight: "700",
    fontStyle: "italic",
    fontDisplay: "swap",
  },
]);

export const inter = fontFace([
  {
    src: 'url("/fonts/Inter-VariableFont_opsz,wght.woff2") format("woff2")',
    fontWeight: "100 900",
    fontStyle: "normal",
    fontDisplay: "swap",
  },
  {
    src: 'url("/fonts/Inter-Italic-VariableFont_opsz,wght.woff2") format("woff2")',
    fontWeight: "100 900",
    fontStyle: "italic",
    fontDisplay: "swap",
  },
]);

export const atkinsonMono = fontFace([
  {
    src: 'url("/fonts/AtkinsonHyperlegibleMono-VariableFont_wght.woff2") format("woff2")',
    fontWeight: "100 900",
    fontStyle: "normal",
    fontDisplay: "swap",
  },
  {
    src: 'url("/fonts/AtkinsonHyperlegibleMono-Italic-VariableFont_wght.woff2") format("woff2")',
    fontWeight: "100 900",
    fontStyle: "italic",
    fontDisplay: "swap",
  },
]);
