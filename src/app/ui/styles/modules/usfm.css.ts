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
import { vars } from "@/app/ui/styles/designSystem.css.ts";

// ============================================
// Base Styles (all modes)
// ============================================

const anyModeButPlain = `[data-mode]:not([data-mode="plain"])`;
const marker = `span[data-token-type="marker"]`;
const verseMarker = `${marker}[data-marker="v"]`;
const chapterMarker = `${marker}[data-marker="c"]`;
const chapterLabelMarker = `${marker}[data-marker="cl"]`;
const endMarker = `span[data-token-type="endMarker"]`;
const numberRange = `[data-token-type="numberRange"]`;
const textToken = `[data-token-type="text"]`;
const dataIsStructuralEmpty = `[data-is-structural-empty="true"]`;
// Verse & Chapter Numbers
globalStyle(
    `${anyModeButPlain} .verse-number, ${anyModeButPlain} ${verseMarker}`,
    {
        fontSize: "0.85em",
        fontWeight: "bold",
        padding: "0 2px",
    },
);

globalStyle(
    `${anyModeButPlain} .chapter-number, ${anyModeButPlain} ${chapterMarker}, ${anyModeButPlain} ${chapterMarker} + ${numberRange}, [data-marker="c"] > ${numberRange}`,
    {
        fontSize: "2em",
        fontWeight: "bold",
        textAlign: "center",
        display: "block",
        margin: `${vars.spacing.sm} 0`,
        fontFamily: vars.typography.fontFamilySerif,
    },
);

globalStyle(
    `${anyModeButPlain} .chapter-label, ${anyModeButPlain} ${chapterLabelMarker}, ${anyModeButPlain} ${chapterLabelMarker} + ${textToken}`,
    {
        fontSize: vars.typography.h4.fontSize,
        textAlign: "center",
        margin: `${vars.spacing.sm} 0`,
        fontFamily: vars.typography.fontFamilySerif,
    },
);

// Number ranges (verses/chapters)
globalStyle(`${anyModeButPlain} ${numberRange}`, {
    color: vars.color.brandBase,
    fontWeight: 600,
});

// Text content
globalStyle(`${anyModeButPlain} ${textToken}`, {
    color: vars.color.onSurfacePrimary,
});

// Peek mode: hide structural empty markers
globalStyle(
    `${anyModeButPlain} .usfm-peek-active .usfm-para-container${dataIsStructuralEmpty}[data-marker]`,
    {
        opacity: 0,
    },
);

globalStyle(
    `${anyModeButPlain} .usfm-peek-active .usfm-para-container${dataIsStructuralEmpty}[data-marker]::before`,
    {
        opacity: 0,
    },
);

// ============================================
// Regular Mode: Clean WYSIWYG
// ============================================
const regularMode = `[data-editor-mode="regular"]`;

// Hide markers and their following br elements
const regularModeMarker = `${regularMode} :where(${marker}[data-marker], ${endMarker})`;

globalStyle(regularModeMarker, {
    display: "none !important",
});

globalStyle(`${regularModeMarker} + br`, {
    display: "none !important",
});

// Marker/endMarker lint errors can be hidden in Regular mode.
// Mirror the underline onto the next visible text/number token.
const lintErrorAdjacentTokens = [
    `${regularModeMarker}.lint-error + ${numberRange}`,
    `${regularModeMarker}.lint-error + ${textToken}`,
    `${regularModeMarker}.lint-error + br + ${numberRange}`,
    `${regularModeMarker}.lint-error + br + ${textToken}`,
];

globalStyle(lintErrorAdjacentTokens.join(", "), {
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: vars.color.onSurfaceError,
    textDecorationThickness: "2px",
    textUnderlineOffset: "3px",
});

// If the hidden marker has no adjacent text token, show a subtle paragraph-level cue.
globalStyle(
    `${regularMode} .usfm-para-container:has(> :where(${marker}, ${endMarker}).lint-error)`,
    {
        boxShadow: `inset 2px 0 0 0 color-mix(in srgb, ${vars.color.onSurfaceError} 70%, transparent)`,
    },
);

// Poetry: Apply to paragraph containers
globalStyle(`${regularMode} .usfm-para-container`, {
    margin: `${vars.spacing.xs} 0`,
});

// Hide boundary linebreaks
const paraContainerBR = `${regularMode} .usfm-para-container > br`;

globalStyle(
    `:where(${paraContainerBR}:first-child, ${paraContainerBR}:last-child)`,
    {
        display: "none !important",
    },
);

// When the browser/Lexical adds a trailing filler <br>, hide the preceding <br> too
globalStyle(
    `${regularMode} .usfm-para-container > br:nth-last-child(2):has(+ br)`,
    {
        display: "none !important",
    },
);

// Poetry: hang verse numbers so the first letter aligns with indented lines
const poetryContainer = `${regularMode} .usfm-para-container[data-marker^="q"]`;

globalStyle(poetryContainer, {
    vars: {
        "--poetry-indent": "0px",
    },
});

// Only hang verse numbers when the verse marker starts a new visual line.
globalStyle(`${poetryContainer} br + ${verseMarker} + ${numberRange}`, {
    display: "inline-block",
    textAlign: "end",
    marginInlineStart: "calc(-0.25 * var(--poetry-indent))",
});

globalStyle(poetryContainer, {
    fontStyle: "italic",
});

// Paragraph indent defaults
globalStyle(`${regularMode} .usfm-para-container[data-marker="p"]`, {
    textIndent: "1.5em",
});

// Select data-ids that match "default-para-*"
globalStyle(`${regularMode} .usfm-para-container[data-id^="default-para-"]`, {
    textIndent: "0 !important",
});

globalStyle(`${regularMode} .usfm-para-container[data-marker="m"]`, {
    textIndent: 0,
});

// Poetry indents
const poetryIndents: Record<string, string> = {
    q: "16px",
    q1: "16px",
    q2: "32px",
    q3: "64px",
    q4: "96px",
};

for (const [poetryMarker, indent] of Object.entries(poetryIndents)) {
    globalStyle(
        `${regularMode} .usfm-para-container[data-marker="${poetryMarker}"]`,
        {
            vars: {
                "--poetry-indent": indent,
            },
            paddingInlineStart: "var(--poetry-indent)",
        },
    );
}

// Blank line marker: force a full empty line
globalStyle(`${regularMode} .usfm-para-container[data-marker="b"]`, {
    minHeight: "1.2em",
    margin: `${vars.spacing.xs} 0`,
});

// Show subtle chips for structural-empty paragraph marker lines
globalStyle(
    `${regularMode} .usfm-para-container${dataIsStructuralEmpty}[data-marker]`,
    {
        position: "relative",
        minHeight: "1.25em",
        color: vars.color.brandBase,
    },
);

globalStyle(
    `${regularMode} .usfm-para-container${dataIsStructuralEmpty}[data-marker]::before`,
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
        padding: `1px ${vars.spacing.sm}`,
        borderRadius: vars.border.radius.full,
        pointerEvents: "none",
    },
);

globalStyle(
    `:where(${regularMode} .usfm-para-container${dataIsStructuralEmpty}[data-marker]:hover, ${regularMode} .usfm-para-container${dataIsStructuralEmpty}[data-marker]:focus-within)::before`,
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
    `#root[data-editor-read-only="true"] .usfm-para-container${dataIsStructuralEmpty}[data-marker]`,
    {
        display: "none",
    },
);

// ============================================
// USFM Mode: Full USFM with Visual Focus
// ============================================

const usfmMode = '[data-editor-mode="usfm"]';
const usfmMarker = `${usfmMode} :where([data-token-type="marker"], [data-token-type="endMarker"])`;

// Markers: visible, smaller, primary color for visual hierarchy
globalStyle(usfmMarker, {
    display: "inline !important",
    fontSize: "0.75em",
    color: vars.color.brandBase,
    opacity: 0.9,
});

// Nested USFM surfaces can live inside a regular-mode editor shell.
// Force marker-adjacent linebreaks back on inside the nearest USFM container.
globalStyle(`${usfmMarker} + br`, {
    display: "initial !important",
});

// Number ranges: use primary palette
globalStyle(`${usfmMode} [data-token-type="numberRange"]`, {
    color: vars.color.brandDark,
    fontWeight: 600,
});

// Verse numbers: chip treatment to distinguish from plain leading numerals
globalStyle(
    `${usfmMode} [data-token-type="marker"][data-marker="v"] + [data-token-type="numberRange"]`,
    {
        display: "inline-block",
        borderRadius: vars.border.radius.full,
        fontSize: "0.74em",
        fontWeight: 700,
        letterSpacing: "0.01em",
        position: "relative",
        color: vars.color.brandBase,
    },
);

// Chapter numbers stay stronger than verse chips
globalStyle(
    `${usfmMode} [data-token-type="marker"][data-marker="c"] + [data-token-type="numberRange"]`,
    {
        color: vars.color.brandBase,
        fontWeight: 700,
    },
);

// When multiple paragraph markers occur consecutively, stack them vertically
globalStyle(`${usfmMode} .isParaMarker + .isParaMarker`, {
    display: "block",
});

// Dark mode USFM verse number background
globalStyle(
    `[data-theme="dark"] ${usfmMode} [data-token-type="marker"][data-marker="v"] + [data-token-type="numberRange"]`,
    {
        background: `color-mix(in srgb, ${vars.color.brandBase} 24%, transparent)`,
    },
);

// ============================================
// Lint Errors & Search Highlighting
// ============================================

// Lint Error States
const lintError = ':where(.lint-error, [data-is-lint-error="true"])';

globalStyle(lintError, {
    position: "relative",
    display: "inline-block",
    paddingInlineEnd: "0.95em",
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: vars.color.onSurfaceError,
    textDecorationThickness: "2px",
    textUnderlineOffset: "3px",
    borderRadius: vars.border.radius.xs,
    background: `color-mix(in srgb, ${vars.color.surfaceError} 60%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${vars.color.onSurfaceError} 30%, transparent)`,
});

globalStyle(`${lintError}::after`, {
    content: '"!"',
    position: "absolute",
    insetInlineEnd: 0,
    top: "-0.1em",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "0.82em",
    height: "0.82em",
    borderRadius: vars.border.radius.full,
    background: vars.color.onSurfaceError,
    color: vars.color.surfacePrimary,
    fontSize: "0.62em",
    fontWeight: 800,
    lineHeight: 1,
    pointerEvents: "none",
    transform: "translateX(55%)",
    boxShadow: `0 0 0 1px color-mix(in srgb, ${vars.color.onSurfaceError} 50%, transparent)`,
});

globalStyle(`${lintError}:hover`, {
    background: `color-mix(in srgb, ${vars.color.surfaceError} 80%, transparent)`,
});

globalStyle(`${lintError}.selected`, {
    background: `color-mix(in srgb, ${vars.color.brandBase} 20%, ${vars.color.surfaceSecondary}) !important`,
    color: `${vars.color.onSurfacePrimary} !important`,
    textDecorationStyle: "solid",
    textDecorationColor: vars.color.brandDark,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${vars.color.brandBase} 40%, transparent)`,
});

globalStyle(`${lintError}.selected::after`, {
    background: vars.color.brandBase,
    color: vars.color.surfacePrimary,
    boxShadow: `0 0 0 1px color-mix(in srgb, ${vars.color.brandDark} 50%, transparent)`,
});

// Dark mode lint adjustments
globalStyle(`[data-theme="dark"] ${lintError}`, {
    textDecorationColor: vars.color.onSurfaceError,
    background: `color-mix(in srgb, ${vars.color.surfaceError} 40%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${vars.color.onSurfaceError} 50%, transparent)`,
});

globalStyle(`[data-theme="dark"] ${lintError}:hover`, {
    background: `color-mix(in srgb, ${vars.color.surfaceError} 60%, transparent)`,
});

// Search highlighting
const searchHighlight = ':where(.search-highlight, [data-search-match="true"])';

globalStyle(`[data-theme="dark"] ${searchHighlight}`, {
    background: "rgba(255, 214, 102, 0.25)",
    outline: "1px solid rgba(255, 196, 0, 0.5)",
});

globalStyle(`[data-theme="light"] ${searchHighlight}`, {
    background: "rgba(255, 214, 102, 0.45)",
    outline: "1px solid rgba(255, 196, 0, 0.85)",
});

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

const complexEmptySelector = [
    '.editor-container div[data-token-type="marker"]',
    `:not(${dataIsStructuralEmpty})`,
    ':not([data-is-nested-editor-button="true"])',
    ':not(:has([data-is-nested-editor-button="true"]))',
    ':not(:has([data-token-type="text"]))',
    ':not(:has([data-token-type="numberRange"]))',
    ':not(:has([data-token-type="error"]))',
].join(" ");

globalStyle(complexEmptySelector, {
    display: "none",
});

globalStyle(
    ':where([data-is-nested-editor-button="true"], [data-is-nested-editor-button="true"] *)',
    {
        display: "inline-flex !important",
    },
);

globalStyle(
    `:where(.editor-container div[data-token-type="marker"]:has(${textToken}), .editor-container div[data-token-type="marker"]:has(${numberRange}))`,
    {
        display: "block",
    },
);
