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
const regularMode = `[data-mode="regular"]`;
const marker = `span[data-token-type="marker"]`;
const verseMarker = `${marker}[data-marker="v"]`;
const chapterMarker = `${marker}[data-marker="c"]`;
const chapterLabelMarker = `${marker}[data-marker="cl"]`;
const endMarker = `span[data-token-type="endMarker"]`;
const numberRange = `[data-token-type="numberRange"]`;
// One numbered-marker node = the whole \v/\c marker+number unit; the visible
// content is the number. Regular mode renders these; usfm/plain modes stay
// flat tokens, so the legacy marker/numberRange selectors below still cover
// those modes.
const numberedMarker = `[data-token-type="numberedMarker"]`;
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
        margin: `${vars.spacing.sm} 0`,
        fontFamily: vars.typography.fontFamilySerif,
    },
);
globalStyle(`${regularMode}  [data-marker="c"] > ${numberRange}`, {
    display: "block",
});

// ============================================
// Numbered-marker nodes (regular mode)
// ============================================

// Verse number: the node IS the visible number — chip look matching the old
// verse-number treatment. pre-wrap keeps junk whitespace parked in the
// number content visible and editable (the delimiter contract flows excess
// forward precisely so it isn't hidden in markup).
globalStyle(`${anyModeButPlain} ${numberedMarker}`, {
    color: vars.color.brandBase,
    fontWeight: "bold",
    fontSize: "0.85em",
    padding: "0 2px",
    whiteSpace: "pre-wrap",
});

// Chapter number: big serif block line (inside its byte-less shell).
globalStyle(`${anyModeButPlain} ${numberedMarker}[data-marker="c"]`, {
    display: "block",
    fontSize: "2em",
    textAlign: "center",
    margin: `${vars.spacing.sm} 0`,
    fontFamily: vars.typography.fontFamilySerif,
});

// Empty node (the transient bad state): give the zero-width node a visible
// footprint so the caret has somewhere to live; the lint finding's
// annotation is the primary affordance on top of this.
globalStyle(`${regularMode} ${numberedMarker}[data-empty="true"]`, {
    display: "inline-block",
    minWidth: "0.7ch",
    minHeight: "1em",
});

// Caret ownership affordances (set by NumberedCaretPlugin from the MODEL
// selection). Explicit currentColor default — Chrome's caret repaint under
// `auto` is unreliable on rule-set changes and retains the previous color;
// currentColor tracks the theme's text color in light/dark.
globalStyle(`[data-mode]`, {
    caretColor: "currentColor",
});
// The number renders in the brand color, so a native caret inside it would
// inherit that blue via currentColor. Pin it to the themed text color instead:
// the caret's blue/red "in number" / "empty" signal is carried entirely by the
// painted bar (our own element), never by the native caret's color.
globalStyle(`${numberedMarker}`, {
    caretColor: vars.color.onSurfacePrimary,
});
// Native caret hides while the painted bar carries the signal; it still
// exists underneath for IME anchoring/focus semantics.
globalStyle(`[data-mode][data-caret-in-number="true"]`, {
    caretColor: "transparent",
});
// Ghost chip tint: the caret says WHERE, the tint whispers the extent of
// what's being edited.
globalStyle(`${numberedMarker}[data-caret-inside="true"]`, {
    background: `color-mix(in srgb, ${vars.color.brandBase} 8%, transparent)`,
    borderRadius: "3px",
});
// The painted bar caret (portaled by NumberedCaretPlugin into the editor
// container). Solid, no blink — blink-free reads as "mode", which is the
// message.
globalStyle(".usfm-numbered-caret", {
    position: "absolute",
    width: "3px",
    borderRadius: "2px",
    background: vars.color.brandBase,
    boxShadow: `0 0 6px color-mix(in srgb, ${vars.color.brandBase} 60%, transparent)`,
    pointerEvents: "none",
    zIndex: 5,
});

// Empty number: the caret turns the error color so "type the number here"
// reads at a glance, distinct from the brand-colored caret on a live number
// and legible on top of the faint empty-slot tint.
globalStyle(".usfm-numbered-caret--empty", {
    background: vars.color.onSurfaceError,
    boxShadow: `0 0 6px color-mix(in srgb, ${vars.color.onSurfaceError} 70%, transparent)`,
});

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

// ============================================
// Regular Mode: Clean WYSIWYG
// ============================================

// Hide markers and their following br elements
const regularModeMarker = `${regularMode} :where(${marker}[data-marker], ${endMarker})`;

globalStyle(regularModeMarker, {
    display: "none !important",
});

globalStyle(`${regularModeMarker} + br`, {
    display: "none !important",
});

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

// Only hang verse numbers when the verse node starts a new visual line.
// The numbered node is a single element, so the hang is just `br + node`.
globalStyle(`${poetryContainer} br + ${numberedMarker}[data-marker="v"]`, {
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
// TODO: GET RID OF NOTION OF STRUCTURAL EMPTINESS WITH CHIPS. CHIPS ARE CONFUSING I THINK
// globalStyle(
//     `${regularMode} .usfm-para-container${dataIsStructuralEmpty}[data-marker]`,
//     {
//         position: "relative",
//         minHeight: "1.25em",
//         color: vars.color.brandBase,
//     },
// );
// TODO: GET RID OF NOTION OF STRUCTURAL EMPTINESS WITH CHIPS. CHIPS ARE CONFUSING I THINK
// globalStyle(`${regularMode} .usfm-para-container${dataIsStructuralEmpty}[data-marker]::before`, {
//   content: "attr(data-marker-label)",
//   position: "absolute",
//   insetInlineStart: 0,
//   top: "50%",
//   transform: "translateY(-50%)",
//   fontSize: "0.72em",
//   fontWeight: 700,
//   letterSpacing: "0.02em",
//   color: "color-mix(in srgb, currentColor 55%, transparent)",
//   background: "color-mix(in srgb, currentColor 10%, transparent)",
//   border: "2px solid color-mix(in srgb, currentColor 14%, transparent)",
//   padding: `1px ${vars.spacing.sm}`,
//   borderRadius: vars.border.radius.full,
//   pointerEvents: "none",
// });

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
// TODO: GET RID OF NOTION OF STRUCTURAL EMPTINESS WITH CHIPS. CHIPS ARE CONFUSING I THINK
// globalStyle(
//   `#root[data-editor-read-only="true"] .usfm-para-container${dataIsStructuralEmpty}[data-marker]`,
//   {
//     display: "none",
//   },
// );

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
// Search Highlighting
// ============================================

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
