import { globalStyle, layer } from "@vanilla-extract/css";

import { vars } from "./designSystem.css.ts";

const reset = layer("reset");

globalStyle("*, *::before, *::after", {
  "@layer": {
    [reset]: {
      boxSizing: "border-box",
      backgroundRepeat: "no-repeat",
    },
  },
});

globalStyle("*", {
  "@layer": {
    [reset]: {
      padding: 0,
      margin: 0,
    },
  },
});

globalStyle("html", {
  "@layer": {
    [reset]: {
      WebkitTextSizeAdjust: "none",
      textSizeAdjust: "none",
      lineHeight: 1.5,
      WebkitFontSmoothing: "antialiased",
      blockSize: "100%",
    },
  },
});

globalStyle("body", {
  "@layer": {
    [reset]: {
      minBlockSize: "100%",
      fontFamily: vars.typography.fontFamily,
    },
  },
});

globalStyle("img, iframe, audio, video, canvas", {
  "@layer": {
    [reset]: {
      display: "block",
      maxInlineSize: "100%",
      blockSize: "auto",
    },
  },
});

globalStyle("svg", {
  "@layer": {
    [reset]: {
      maxInlineSize: "100%",
    },
  },
});

globalStyle("svg:not([fill])", {
  "@layer": {
    [reset]: {
      fill: "currentColor",
    },
  },
});

globalStyle("input, button, textarea, select", {
  "@layer": {
    [reset]: {
      font: "inherit",
    },
  },
});

globalStyle("textarea", {
  "@layer": {
    [reset]: {
      resize: "vertical",
    },
  },
});

globalStyle("fieldset, iframe", {
  "@layer": {
    [reset]: {
      border: "none",
    },
  },
});

globalStyle("p, h1, h2, h3, h4, h5, h6", {
  "@layer": {
    [reset]: {
      overflowWrap: "break-word",
    },
  },
});

globalStyle("p", {
  "@layer": {
    [reset]: {
      textWrap: "pretty",
      fontVariantNumeric: "proportional-nums",
    },
  },
});

globalStyle("h1, h2, h3, h4, h5, h6", {
  "@layer": {
    [reset]: {
      fontVariantNumeric: "lining-nums",
    },
  },
});

globalStyle("p, blockquote, q, figcaption, li", {
  "@layer": {
    [reset]: {
      hangingPunctuation: "first allow-end last",
    },
  },
});

globalStyle("input, label, button, h1, h2, h3, h4, h5, h6", {
  "@layer": {
    [reset]: {
      lineHeight: 1.1,
    },
  },
});

globalStyle("math, time, table", {
  "@layer": {
    [reset]: {
      fontVariantNumeric: "tabular-nums lining-nums slashed-zero",
    },
  },
});

globalStyle("code", {
  "@layer": {
    [reset]: {
      fontVariantNumeric: "slashed-zero",
    },
  },
});

globalStyle("table", {
  "@layer": {
    [reset]: {
      borderCollapse: "collapse",
    },
  },
});

globalStyle("abbr", {
  "@layer": {
    [reset]: {
      fontVariantCaps: "all-small-caps",
    },
  },
  textDecoration: "none",
});

globalStyle("abbr[title]", {
  "@layer": {
    [reset]: {
      cursor: "help",
      textDecoration: "underline dotted",
    },
  },
});

globalStyle("sup, sub", {
  "@layer": {
    [reset]: {
      lineHeight: 0,
    },
  },
});

globalStyle(":disabled", {
  "@layer": {
    [reset]: {
      opacity: 0.8,
      cursor: "not-allowed",
    },
  },
});

globalStyle(":focus-visible", {
  "@layer": {
    [reset]: {
      outlineOffset: "0.2rem",
    },
  },
});
