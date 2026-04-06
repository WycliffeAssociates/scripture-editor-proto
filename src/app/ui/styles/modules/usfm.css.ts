/**
 * USFM Editor Global Styles
 *
 * Global styles for dynamically rendered USFM markup. These styles target
 * data attributes applied by the editor plugins and must be global since
 * the markup is created dynamically by Lexical.
 *
 * All colors now use the design system CSS custom properties.
 */

import { globalStyle } from "@vanilla-extract/css";

// ============================================
// Base Styles (all modes)
// ============================================

globalStyle("body:not(.source-mode)", {
    lineHeight: 1.6,
});

// Verse & Chapter Numbers
globalStyle('.verse-number, span[data-token-type="marker"][data-marker="v"]', {
    fontSize: "0.8em",
    fontWeight: "bold",
    padding: "0 2px",
});

globalStyle(
    '.chapter-number, span[data-token-type="marker"][data-marker="c"], span[data-token-type="marker"][data-marker="c"] + [data-token-type="numberRange"]',
    {
        fontSize: "2em",
        fontWeight: "bold",
        textAlign: "center",
        margin: "0.5em 0",
        fontFamily: "var(--font-serif)",
    },
);

globalStyle(
    '.chapter-label, span[data-token-type="marker"][data-marker="cl"], span[data-token-type="marker"][data-marker="cl"] + [data-token-type="text"]',
    {
        fontSize: "1.2em",
        textAlign: "center",
        margin: "0.5em 0",
        fontFamily: "var(--font-serif)",
    },
);

// Number ranges (verses/chapters)
globalStyle('[data-token-type="numberRange"]', {
    color: "var(--color-brand-base)",
    fontWeight: 600,
});

// Text content
globalStyle('[data-token-type="text"]', {
    color: "var(--color-on-surface-primary)",
});

globalStyle(
    '.usfm-peek-active .usfm-para-container[data-is-structural-empty="true"][data-marker]',
    {
        opacity: 0,
    },
);

globalStyle(
    '.usfm-peek-active .usfm-para-container[data-is-structural-empty="true"][data-marker]::before',
    {
        opacity: 0,
    },
);

// ============================================
// Regular Mode: Clean WYSIWYG
// ============================================

// Hide markers and their following br elements
globalStyle(
    '[data-editor-mode="regular"] :where(span[data-token-type="marker"][data-marker], span[data-token-type="endMarker"][data-marker])',
    {
        display: "none !important",
    },
);

globalStyle(
    '[data-editor-mode="regular"] :where(span[data-token-type="marker"][data-marker], span[data-token-type="endMarker"][data-marker]) + br',
    {
        display: "none !important",
    },
);

// Marker/endMarker lint errors can be hidden in Regular mode.
// Mirror the underline onto the next visible text/number token.
globalStyle(
    `
  [data-editor-mode="regular"] :where(span[data-token-type="marker"], span[data-token-type="endMarker"]).lint-error + span[data-token-type="numberRange"],
  [data-editor-mode="regular"] :where(span[data-token-type="marker"], span[data-token-type="endMarker"]).lint-error + span[data-token-type="text"],
  [data-editor-mode="regular"] :where(span[data-token-type="marker"], span[data-token-type="endMarker"]).lint-error + br + span[data-token-type="numberRange"],
  [data-editor-mode="regular"] :where(span[data-token-type="marker"], span[data-token-type="endMarker"]).lint-error + br + span[data-token-type="text"]
`,
    {
        textDecorationLine: "underline",
        textDecorationStyle: "dotted",
        textDecorationColor: "var(--color-on-surface-error)",
        textDecorationThickness: "2px",
        textUnderlineOffset: "3px",
    },
);

// If the hidden marker has no adjacent text token, show a subtle paragraph-level cue.
globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container:has(> :where(span[data-token-type="marker"], span[data-token-type="endMarker"]).lint-error)',
    {
        boxShadow:
            "inset 2px 0 0 0 color-mix(in srgb, var(--color-on-surface-error) 70%, transparent)",
    },
);

// Poetry: Apply to paragraph containers
globalStyle('[data-editor-mode="regular"] .usfm-para-container', {
    margin: "0.25em 0",
});

// Hide boundary linebreaks
globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container > br:first-child, [data-editor-mode="regular"] .usfm-para-container > br:last-child',
    {
        display: "none !important",
    },
);

// When the browser/Lexical adds a trailing filler <br>, hide the preceding <br> too
globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container > br:nth-last-child(2):has(+ br)',
    {
        display: "none !important",
    },
);

// Poetry: hang verse numbers so the first letter aligns with indented lines
globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-marker^="q"]',
    {
        vars: {
            "--poetry-indent": "0px",
        },
    },
);

// Only hang verse numbers when the verse marker starts a new visual line.
globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-marker^="q"] br + span[data-token-type="marker"][data-marker="v"] + span[data-token-type="numberRange"]',
    {
        display: "inline-block",
        textAlign: "end",
        marginInlineStart: "calc(-0.25 * var(--poetry-indent))",
    },
);

globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-marker^="q"]',
    {
        fontStyle: "italic",
    },
);

// Paragraph indent defaults
globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-marker="p"]',
    {
        textIndent: "1.5em",
    },
);

// Select data-ids that match "default-para-*"
globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-id^="default-para-"]',
    {
        textIndent: "0 !important",
    },
);

globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-marker="m"]',
    {
        textIndent: 0,
    },
);

globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-marker="q"], [data-editor-mode="regular"] .usfm-para-container[data-marker="q1"]',
    {
        vars: {
            "--poetry-indent": "16px",
        },
        paddingInlineStart: "var(--poetry-indent)",
    },
);

globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-marker="q2"]',
    {
        vars: {
            "--poetry-indent": "32px",
        },
        paddingInlineStart: "var(--poetry-indent)",
    },
);

globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-marker="q3"]',
    {
        vars: {
            "--poetry-indent": "64px",
        },
        paddingInlineStart: "var(--poetry-indent)",
    },
);

globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-marker="q4"]',
    {
        vars: {
            "--poetry-indent": "96px",
        },
        paddingInlineStart: "var(--poetry-indent)",
    },
);

// Blank line marker: force a full empty line
globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-marker="b"]',
    {
        minHeight: "1.2em",
        margin: "0.6em 0",
    },
);

// Show subtle chips for structural-empty paragraph marker lines
globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-is-structural-empty="true"][data-marker]',
    {
        position: "relative",
        minHeight: "1.25em",
        color: "var(--color-brand-base)",
    },
);

globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-is-structural-empty="true"][data-marker]::before',
    {
        content: "attr(data-marker-label)",
        position: "absolute",
        insetInlineStart: 0,
        top: "50%",
        transform: "translateY(-50%)",
        fontSize: "0.72em",
        fontWeight: 700,
        letterSpacing: "0.02em",
        color: "color-mix(in srgb, currentColor 55%, transparent)",
        background: "color-mix(in srgb, currentColor 10%, transparent)",
        border: "2px solid color-mix(in srgb, currentColor 14%, transparent)",
        padding: "1px 6px",
        borderRadius: "999px",
        pointerEvents: "none",
    },
);

globalStyle(
    '[data-editor-mode="regular"] .usfm-para-container[data-is-structural-empty="true"][data-marker]:hover::before, [data-editor-mode="regular"] .usfm-para-container[data-is-structural-empty="true"][data-marker]:focus-within::before',
    {
        color: "color-mix(in srgb, currentColor 75%, transparent)",
        background: "color-mix(in srgb, currentColor 12%, transparent)",
        borderColor: "color-mix(in srgb, currentColor 22%, transparent)",
    },
);

// Prevent double spacing: keep the paragraph semantics, drop the preceding break
globalStyle('[data-editor-mode="regular"] br:has(+ .isParaMarker)', {
    display: "none !important",
});

// View-only: keep the structural spacing but hide the "empty marker" chips
globalStyle(
    '#root[data-editor-read-only="true"] .usfm-para-container[data-is-structural-empty="true"][data-marker]',
    {
        display: "none",
    },
);

// ============================================
// USFM Mode: Full USFM with Visual Focus
// ============================================

// Markers: visible, smaller, primary color for visual hierarchy
globalStyle(
    '[data-editor-mode="usfm"] [data-token-type="marker"], [data-editor-mode="usfm"] [data-token-type="endMarker"]',
    {
        fontSize: "0.75em",
        color: "var(--color-brand-base)",
        opacity: 0.9,
    },
);

// Number ranges: use primary palette
globalStyle('[data-editor-mode="usfm"] [data-token-type="numberRange"]', {
    color: "var(--color-brand-dark)",
    fontWeight: 600,
});

// Verse numbers: chip treatment to distinguish from plain leading numerals
globalStyle(
    '[data-editor-mode="usfm"] [data-token-type="marker"][data-marker="v"] + [data-token-type="numberRange"]',
    {
        display: "inline-block",
        borderRadius: "999px",
        fontSize: "0.74em",
        fontWeight: 700,
        letterSpacing: "0.01em",
        position: "relative",
        color: "var(--color-brand-base)",
    },
);

// Chapter numbers stay stronger than verse chips
globalStyle(
    '[data-editor-mode="usfm"] [data-token-type="marker"][data-marker="c"] + [data-token-type="numberRange"]',
    {
        color: "var(--color-brand-base)",
        fontWeight: 700,
    },
);

// When multiple paragraph markers occur consecutively, stack them vertically
globalStyle('[data-editor-mode="usfm"] .isParaMarker + .isParaMarker', {
    display: "block",
});

// Dark mode USFM verse number background
globalStyle(
    '[data-theme="dark"][data-editor-mode="usfm"] [data-token-type="marker"][data-marker="v"] + [data-token-type="numberRange"]',
    {
        background:
            "color-mix(in srgb, var(--color-brand-base) 24%, transparent)",
    },
);

// ============================================
// Lint Errors & Search Highlighting
// ============================================

// Lint Error States
globalStyle(':where(.lint-error, [data-is-lint-error="true"])', {
    position: "relative",
    display: "inline-block",
    paddingInlineEnd: "0.95em",
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: "var(--color-on-surface-error)",
    textDecorationThickness: "2px",
    textUnderlineOffset: "3px",
    borderRadius: "3px",
    background:
        "color-mix(in srgb, var(--color-surface-error) 60%, transparent)",
    boxShadow:
        "inset 0 0 0 1px color-mix(in srgb, var(--color-on-surface-error) 30%, transparent)",
});

globalStyle(':where(.lint-error, [data-is-lint-error="true"])::after', {
    content: '"!"',
    position: "absolute",
    insetInlineEnd: 0,
    top: "-0.1em",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "0.82em",
    height: "0.82em",
    borderRadius: "999px",
    background: "var(--color-on-surface-error)",
    color: "var(--color-surface-primary)",
    fontSize: "0.62em",
    fontWeight: 800,
    lineHeight: 1,
    pointerEvents: "none",
    transform: "translateX(55%)",
    boxShadow:
        "0 0 0 1px color-mix(in srgb, var(--color-on-surface-error) 50%, transparent)",
});

globalStyle(':where(.lint-error, [data-is-lint-error="true"]):hover', {
    background:
        "color-mix(in srgb, var(--color-surface-error) 80%, transparent)",
});

globalStyle(':where(.lint-error, [data-is-lint-error="true"]).selected', {
    background:
        "color-mix(in srgb, var(--color-brand-base) 20%, var(--color-surface-secondary)) !important",
    color: "var(--color-on-surface-primary) !important",
    textDecorationStyle: "solid",
    textDecorationColor: "var(--color-brand-dark)",
    boxShadow:
        "inset 0 0 0 1px color-mix(in srgb, var(--color-brand-base) 40%, transparent)",
});

globalStyle(
    ':where(.lint-error, [data-is-lint-error="true"]).selected::after',
    {
        background: "var(--color-brand-base)",
        color: "var(--color-surface-primary)",
        boxShadow:
            "0 0 0 1px color-mix(in srgb, var(--color-brand-dark) 50%, transparent)",
    },
);

// Dark mode lint adjustments
globalStyle(
    '[data-theme="dark"] :where(.lint-error, [data-is-lint-error="true"])',
    {
        textDecorationColor: "var(--color-on-surface-error)",
        background:
            "color-mix(in srgb, var(--color-surface-error) 40%, transparent)",
        boxShadow:
            "inset 0 0 0 1px color-mix(in srgb, var(--color-on-surface-error) 50%, transparent)",
    },
);

globalStyle(
    '[data-theme="dark"] :where(.lint-error, [data-is-lint-error="true"]):hover',
    {
        background:
            "color-mix(in srgb, var(--color-surface-error) 60%, transparent)",
    },
);

// Dark mode search highlighting
globalStyle(
    '[data-theme="dark"] .search-highlight, [data-theme="dark"] [data-search-match="true"]',
    {
        background: "rgba(255, 214, 102, 0.25)",
        outline: "1px solid rgba(255, 196, 0, 0.5)",
    },
);

// Light mode search highlighting
globalStyle(
    '[data-theme="light"] .search-highlight, [data-theme="light"] [data-search-match="true"]',
    {
        background: "rgba(255, 214, 102, 0.45)",
        outline: "1px solid rgba(255, 196, 0, 0.85)",
    },
);

// ============================================
// Nested Editor Support
// ============================================

globalStyle(".nested-editor", {
    display: "inline-flex",
});

globalStyle(".nested-editor:has(+ .isParaMarker)::after", {
    content: '""',
});

// ============================================
// Empty Paragraph Handling
// ============================================

globalStyle(
    '.editor-container div[data-token-type="marker"]:not([data-is-structural-empty="true"]) :not([data-is-nested-editor-button="true"]):not(:has([data-is-nested-editor-button="true"])):not(:has([data-token-type="text"])) :not(:has([data-token-type="numberRange"])):not(:has([data-token-type="error"]))',
    {
        display: "none",
    },
);

globalStyle(
    '[data-is-nested-editor-button="true"], [data-is-nested-editor-button="true"] *',
    {
        display: "inline-flex !important",
    },
);

globalStyle(
    '.editor-container div[data-token-type="marker"]:has([data-token-type="text"]), .editor-container div[data-token-type="marker"]:has([data-token-type="numberRange"])',
    {
        display: "block",
    },
);
