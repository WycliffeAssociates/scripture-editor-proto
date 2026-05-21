// formBlock.css.ts
//
// Styles for the discourse-first form-mode renderer. Each FormBlockCard
// is one paragraph-class container (\p, \q1, \q2, ...) whose verse
// fragments render as rows. Visual hierarchy comes from typesetting
// (indent staircase, italic poetry) and from a merged "card surface"
// that flows across paragraph→poetry runs (see the layered-card
// rules near the bottom).

import { globalStyle, style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

// Form-mode-specific values. `FIELD_RADIUS` and `ROW_GAP` map onto
// existing design tokens; the rest are layout-specific to this
// surface (the designer's prototype uses 14px / 28px / 64px / 32px
// pixel grid that doesn't line up with any token) and stay
// file-local.
const CARD_RADIUS = "14px";
const FIELD_RADIUS = vars.border.radius.lg;
const ROW_GAP = "10px";
const INDENT_STEP = "28px";
const RAIL_WIDTH = "64px";
const ADD_AFTER_WIDTH = "32px";

// Shared transition timing for hover-revealed chrome (rails, pills,
// delete X). Standardized so all the form-mode affordances feel like
// one system.
const HOVER_TRANSITION = "120ms cubic-bezier(0.2, 0.8, 0.2, 1)";

// ---------------------------------------------------------------------
// Card body — the FragmentStack container; takes the white surface and
// houses the per-row grid. Block-level chrome (BlockHeader) is gone;
// only rows and inter-row affordances render here.
export const block = style({
    display: "flex",
    flexDirection: "column",
    gap: ROW_GAP,
    margin: 0,
    position: "relative",
});

// ---------------------------------------------------------------------
// Row — one fragment.
// Grid: [rail | field | add-after]. Rail and add-after appear on hover.
export const row = style({
    display: "grid",
    gridTemplateColumns: `${RAIL_WIDTH} 1fr ${ADD_AFTER_WIDTH}`,
    alignItems: "start",
    gap: "8px",
    position: "relative",
});

// Verse label that sits in its own row above the verse-start row.
// Padded to align with the field column (rail width + small breathing
// room).
export const verseLabel = style({
    fontSize: vars.typography.bodySmall.fontSize,
    fontWeight: 600,
    color: vars.color.onSurfacePrimary,
    paddingLeft: `calc(${RAIL_WIDTH} + 8px)`,
    marginTop: "6px",
    marginBottom: "-2px",
    letterSpacing: "-0.005em",
});

// Left rail: indent-decrease / indent-increase buttons. Hover-revealed.
export const rail = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "2px",
    paddingTop: "6px",
    height: "100%",
    opacity: 0,
    transition: `opacity ${HOVER_TRANSITION}`,
});

globalStyle(`${row}:hover ${rail}, ${row}:focus-within ${rail}`, {
    opacity: 1,
});

// Right rail: + add-line button. Hover-revealed. Drops into the gap
// below the row (so it visually sits between rows), except for the
// last row of a card where it stays beside the row itself.
export const rightRail = style({
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    alignSelf: "end",
    transform: `translateY(calc(50% + ${ROW_GAP} / 2))`,
    opacity: 0,
    transition: `opacity ${HOVER_TRANSITION}`,
    zIndex: 2,
});

globalStyle(`${row}:hover ${rightRail}, ${row}:focus-within ${rightRail}`, {
    opacity: 1,
});

// Last row of the stack: keep the + on the same line as the row.
export const rowLast = style({});
globalStyle(`${rowLast} ${rightRail}`, {
    alignSelf: "start",
    transform: "none",
    paddingTop: "6px",
});

// ---------------------------------------------------------------------
// Field — the input container per row. Sunken slate background by
// default; on focus, becomes white with a brand border + ring.
export const field = style({
    position: "relative",
    display: "flex",
    alignItems: "flex-start",
    borderRadius: FIELD_RADIUS,
    border: `1px solid transparent`,
    background: vars.color.surfaceTertiary,
    transition: `background ${HOVER_TRANSITION}, border-color ${HOVER_TRANSITION}, box-shadow ${HOVER_TRANSITION}`,
    selectors: {
        "&:focus-within": {
            background: vars.color.surfacePrimary,
            borderColor: vars.color.brandBase,
            boxShadow: `0 0 0 3px ${vars.color.brandLight}`,
        },
        // Cross-pane focus alignment: the row containing this field
        // got `data-aligned="true"` from FormFocusContext because the
        // user focused the equivalent fragment on the source pane.
        // Paint a brand ring on the field so the eye lands on the
        // corresponding text on the reference side.
        '[data-aligned="true"] &': {
            borderColor: vars.color.brandBase,
            boxShadow: `0 0 0 3px ${vars.color.brandLight}`,
        },
    },
});

// Variant: invalid (missing verse text). Light error background.
export const fieldInvalid = style({
    background: vars.color.surfaceError,
    borderColor: vars.color.onSurfaceError,
});

// Variant: poetry / continuation rows have no number; the slot is
// kept for layout alignment but the digit is hidden.
export const fieldContinuation = style({});

// Indent levels — visual content shift by stepping margin-left on the
// field. `\p` rows sit flush; `\q1` shifts one step, `\q2` two steps.
// (The card edge does not shift — the row width contracts.)
export const rowIndent1 = style({});
globalStyle(`${rowIndent1} ${field}`, { marginLeft: INDENT_STEP });
export const rowIndent2 = style({});
globalStyle(`${rowIndent2} ${field}`, {
    marginLeft: `calc(${INDENT_STEP} * 2)`,
});

// Verse number gutter inside the field — small, muted, tabular.
export const verseNum = style({
    flex: "0 0 auto",
    alignSelf: "stretch",
    display: "flex",
    alignItems: "flex-start",
    padding: "10px 4px 12px 14px",
    color: vars.color.onSurfaceTertiary,
    fontFamily: vars.typography.fontFamilyMono,
    fontSize: "11px",
    fontWeight: 500,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1.6,
    minWidth: "18px",
    userSelect: "none",
    pointerEvents: "none",
});

// Continuation field's verse-number slot — preserved for column
// alignment but the digit is hidden. Vanilla-extract style names are
// hashed; reference them via interpolation so the selector actually
// matches.
globalStyle(`${fieldContinuation} .${verseNum}`, { visibility: "hidden" });

// The textarea proper sits naked inside the field.
export const textarea = style({
    flex: "1 1 auto",
    appearance: "none",
    border: 0,
    outline: "none",
    resize: "none",
    background: "transparent",
    color: vars.color.onSurfacePrimary,
    fontFamily: vars.typography.fontFamilySerif,
    fontSize: "15px",
    lineHeight: 1.6,
    padding: "12px 14px 12px 6px",
    minHeight: "22px",
    width: "100%",
    overflow: "hidden",
    selectors: {
        "&::placeholder": {
            color: vars.color.onSurfaceTertiary,
            fontStyle: "italic",
        },
        "&:focus": { outline: "none" },
    },
});

// Read-only fragment text (reference pane).
export const readOnlyText = style({
    flex: "1 1 auto",
    margin: 0,
    padding: "12px 14px 12px 6px",
    color: vars.color.onSurfacePrimary,
    fontFamily: vars.typography.fontFamilySerif,
    fontSize: "15px",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
});

export const readOnlyPlaceholder = style({
    color: vars.color.onSurfaceTertiary,
    fontStyle: "italic",
});

// Per-row delete X (×). Hover-revealed inside the field at the
// right edge. On a single-fragment block, deletes the whole block;
// otherwise just the fragment.
export const rowDelete = style({
    position: "absolute",
    right: "6px",
    top: "50%",
    transform: "translateY(-50%)",
    opacity: 0,
    transition: `opacity ${HOVER_TRANSITION}`,
});

globalStyle(`${field}:hover ${rowDelete}, ${field}:focus-within ${rowDelete}`, {
    opacity: 1,
});

// Error icon on the right of an invalid field.
export const errIcon = style({
    alignSelf: "center",
    paddingRight: "12px",
    color: vars.color.onSurfaceError,
    display: "none",
});
globalStyle(`${fieldInvalid} ${errIcon}`, { display: "inline-flex" });

// ---------------------------------------------------------------------
// Icon button (used in rails, card chrome, etc.)
export const iconButton = style({
    appearance: "none",
    border: 0,
    background: "transparent",
    width: "28px",
    height: "28px",
    borderRadius: "8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars.color.onSurfaceSecondary,
    cursor: "pointer",
    transition: `background ${HOVER_TRANSITION}, color ${HOVER_TRANSITION}`,
    selectors: {
        "&:hover:not(:disabled)": {
            backgroundColor: vars.button.tertiary.surfaceHover,
            color: vars.color.brandBase,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.brandBase}`,
        },
        "&:disabled": {
            opacity: 0.35,
            cursor: "default",
        },
    },
});

// Danger variant for the continuation-delete ×.
export const iconButtonDanger = style({
    selectors: {
        "&:hover:not(:disabled)": {
            color: vars.color.onSurfaceError,
            backgroundColor: vars.color.surfaceError,
        },
    },
});

// ---------------------------------------------------------------------
// Add-after (the trailing + on each row, opens a marker menu).
export const addAfter = style({
    width: "28px",
    height: "28px",
    borderRadius: "999px",
    border: `1px solid ${vars.color.surfaceBorder}`,
    background: vars.color.surfacePrimary,
    color: vars.color.onSurfaceSecondary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    appearance: "none",
    transition: `color ${HOVER_TRANSITION}, border-color ${HOVER_TRANSITION}, background ${HOVER_TRANSITION}`,
    selectors: {
        "&:hover, &[data-popup-open]": {
            color: vars.color.brandBase,
            borderColor: vars.color.brandBase,
            background: vars.color.brandLight,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.brandBase}`,
        },
    },
});

// ---------------------------------------------------------------------
// Implicit "Chapter N" badge (the chapter framing block before the
// first paragraph). Non-editable.
export const chapterBadge = style({
    display: "inline-flex",
    alignItems: "baseline",
    gap: vars.spacing.xs,
    padding: `${vars.spacing.xs} 0`,
    color: vars.color.onSurfaceSecondary,
});

export const chapterBadgeLabel = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
});

export const chapterBadgeNumber = style({
    fontSize: vars.typography.h4.fontSize,
    fontWeight: 700,
    color: vars.color.onSurfacePrimary,
});

// ---------------------------------------------------------------------
// Inter-card "Combine" pill — sits in the gap above a paragraph card
// when the predecessor card is also paragraph-rooted. Hover-revealed
// via the stack's hover-state.
// Sits absolutely in the gap above the card. The card's marginTop
// (18px) provides the gap; the slot covers it and a small reach into
// the card and the predecessor so it's easy to hit.
export const combineSlot = style({
    position: "absolute",
    top: "-22px",
    left: 0,
    right: 0,
    height: "26px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    opacity: 0,
    transition: `opacity ${HOVER_TRANSITION}`,
    zIndex: 4,
});

globalStyle(`${combineSlot}:hover`, { opacity: 1 });

export const combinePill = style({
    appearance: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 12px 4px 10px",
    borderRadius: "999px",
    background: vars.color.surfacePrimary,
    border: `1px solid ${vars.color.surfaceBorder}`,
    color: vars.color.onSurfaceSecondary,
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: vars.shadow.small,
    transition: `color ${HOVER_TRANSITION}, border-color ${HOVER_TRANSITION}, background ${HOVER_TRANSITION}`,
    selectors: {
        "&:hover": {
            color: vars.color.brandBase,
            borderColor: vars.color.brandBase,
            background: vars.color.brandLight,
        },
    },
});

// ---------------------------------------------------------------------
// Inline "Split paragraph" pill — sits in the within-card gap above a
// row that starts a new verse (split candidate). Hover-revealed by
// either side of the gap.
export const splitGap = style({
    height: "24px",
    position: "relative",
    pointerEvents: "auto",
});

globalStyle(`${splitGap}::before`, {
    content: '""',
    position: "absolute",
    left: RAIL_WIDTH,
    right: ADD_AFTER_WIDTH,
    top: "50%",
    height: "1px",
    background: `linear-gradient(to right, transparent, ${vars.color.surfaceBorder} 18%, ${vars.color.surfaceBorder} 82%, transparent)`,
    opacity: 0,
    transition: `opacity ${HOVER_TRANSITION}`,
});

globalStyle(`${splitGap}:hover::before`, { opacity: 0.6 });

export const splitPill = style({
    appearance: "none",
    position: "absolute",
    left: "50%",
    top: "78%",
    transform: "translate(-50%, -50%)",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "3px 10px 3px 8px",
    borderRadius: "999px",
    background: vars.color.surfacePrimary,
    border: `1px solid ${vars.color.surfaceBorder}`,
    color: vars.color.onSurfaceSecondary,
    fontSize: "11px",
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: vars.shadow.small,
    zIndex: 3,
    opacity: 0,
    pointerEvents: "none",
    transition: `opacity ${HOVER_TRANSITION}, color ${HOVER_TRANSITION}, border-color ${HOVER_TRANSITION}`,
    whiteSpace: "nowrap",
    selectors: {
        "&:hover": {
            color: vars.color.brandBase,
            borderColor: vars.color.brandBase,
        },
    },
});

globalStyle(`${splitGap}:hover ${splitPill}`, {
    opacity: 1,
    pointerEvents: "auto",
});

// ---------------------------------------------------------------------
// Insert-marker menu (shared by `+` rail button and right-click
// in-textarea context menu).
export const insertMenuPopup = style({
    backgroundColor: vars.color.surfacePrimary,
    borderRadius: vars.border.radius.sm,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    boxShadow: vars.shadow.large,
    padding: "0.125rem",
    minWidth: "12rem",
});

export const insertMenuItem = style({
    appearance: "none",
    border: "none",
    backgroundColor: "transparent",
    borderRadius: vars.border.radius.sm,
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 500,
    textAlign: "left",
    lineHeight: 1.2,
    padding: `0.375rem ${vars.spacing.sm}`,
    minHeight: "1.75rem",
    cursor: "pointer",
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: vars.spacing.sm,
    selectors: {
        "&:hover, &[data-highlighted]": {
            backgroundColor: vars.button.tertiary.surfaceHover,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
        },
    },
});

export const insertMenuItemMarker = style({
    color: vars.color.onSurfaceTertiary,
    fontFamily: vars.typography.fontFamilyMono,
});

// Heading row text styling.
export const headingFragmentLabel = style({
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
});

// =====================================================================
// Per-block-kind typesetting, applied to the Lexical decorator wrapper
// (`.form-block-node` + `.kind-{marker}`, set in FormBlockNode).
// =====================================================================

const BLOCK = ".form-block-node";

// ---------------------------------------------------------------------
// Wrapper itself acts as a CARD when card-eligible (paragraph / poetry
// / list). Heading blocks render bare typography (no card). Rule and
// implicit blocks have special treatment (rule = hidden, implicit =
// chapter badge).

const PARAGRAPH_BLOCK = `${BLOCK}[data-block-category="paragraph"]`;
const POETRY_BLOCK = `${BLOCK}[data-block-category="poetry"]`;
const LIST_BLOCK = `${BLOCK}[data-block-category="list"]`;
const RULE_BLOCK = `${BLOCK}[data-block-category="rule"]`;

const CARD_ELIGIBLE = [PARAGRAPH_BLOCK, POETRY_BLOCK, LIST_BLOCK].join(", ");

// Rule blocks: completely hidden (tokens preserved; no UI surface).
globalStyle(RULE_BLOCK, { display: "none" });

// Base card surface for card-eligible blocks.
globalStyle(CARD_ELIGIBLE, {
    position: "relative",
    background: vars.color.surfacePrimary,
    border: `1px solid ${vars.color.surfaceBorder}`,
    borderRadius: CARD_RADIUS,
    boxShadow: vars.shadow.small,
    padding: "18px 20px 20px",
    marginTop: "18px",
    transition:
        "box-shadow 200ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
});

// First card in the editor: no leading margin.
globalStyle(`${BLOCK}:first-child`, { marginTop: 0 });

globalStyle(`[data-form-pane="source"]`, {
    padding: `0 ${vars.spacing.md}`,
});

// Reference pane: flatten as much form-mode chrome as possible so
// the read-only side reads close to regular-mode rendering. Same DOM
// shape (FormBlockNode tree) but with no card surface, no editable-
// looking field background, no indent-rail gutters. Cross-pane focus
// alignment still works via `[data-aligned="true"]`.
globalStyle(
    [
        `[data-form-pane="reference"] ${PARAGRAPH_BLOCK}`,
        `[data-form-pane="reference"] ${POETRY_BLOCK}`,
        `[data-form-pane="reference"] ${LIST_BLOCK}`,
    ].join(", "),
    {
        background: "transparent",
        border: "none",
        boxShadow: "none",
        borderRadius: 0,
        padding: 0,
        marginTop: vars.spacing.sm,
    },
);
// Field background is removed so the rows aren't "filled inputs"
// visually; on aligned rows the brand ring still paints (handled by
// the `[data-aligned="true"] &` selector on `.field`).
globalStyle(`[data-form-pane="reference"] .${field}`, {
    background: "transparent",
});
// Collapse the rail + add-after columns to zero on the reference
// side. The rail div is rendered but empty (buttons gated in JSX);
// the add-after column is the third grid track. Removing the column
// space lets the field consume the full width, so prose flows naturally.
globalStyle(`[data-form-pane="reference"] .${row}`, {
    gridTemplateColumns: "0 1fr 0",
    gap: 0,
});
// Tighten the verse-label gutter — the label is still useful for
// boundary clarity, but the form-mode left-padding (sized to match
// the editing rail) looks alien on the reference side.
globalStyle(`[data-form-pane="reference"] .${verseLabel}`, {
    paddingLeft: 0,
});

// ---------------------------------------------------------------------
// Continuation collapse: card-eligible blocks that share the same
// logical paragraph (mixed prose + poetry within a single discourse
// unit) flow into one visual card. The only "real" card break in
// form mode is `paragraph + paragraph` (the vertical-rhythm boundary
// between two distinct paragraphs) — for that case the Combine pill
// affordance lets the user merge them on demand.
//
// Continuation pairs (this block continues the predecessor's card):
//   - paragraph → poetry            (`\p` followed by stanza)
//   - poetry    → poetry            (stanza chain)
//   - list      → poetry            (poetry inside a list item)
//
// Paragraph and list ALWAYS start a new card (a `\p` is a paragraph
// break by USFM definition — even after a poetry stanza). Headings
// and rules are always separators. The Combine pill lets the user
// merge adjacent paragraph cards on demand.
//
// Bridged variants account for hidden rule siblings (`\b`/`\pb`) —
// rules are invisible in form mode but still occupy a DOM slot, so
// CSS `+` doesn't see across them by default. One bridged level is
// sufficient in practice.
const CONTINUATION_PAIRS: Array<[string, string]> = [
    [PARAGRAPH_BLOCK, POETRY_BLOCK],
    [POETRY_BLOCK, POETRY_BLOCK],
    [LIST_BLOCK, POETRY_BLOCK],
];

const CONTINUATION_SELECTORS = CONTINUATION_PAIRS.flatMap(([a, b]) => [
    `${a} + ${b}`,
    `${a} + ${RULE_BLOCK} + ${b}`,
]).join(", ");

globalStyle(CONTINUATION_SELECTORS, {
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTop: "none",
    paddingTop: 0,
});

const PREDECESSOR_OF_CONTINUATION = CONTINUATION_PAIRS.flatMap(([a, b]) => [
    `${a}:has(+ ${b})`,
    `${a}:has(+ ${RULE_BLOCK} + ${b})`,
]).join(", ");

globalStyle(PREDECESSOR_OF_CONTINUATION, {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottom: "none",
    paddingBottom: "8px",
});

// ---------------------------------------------------------------------
// Poetry styling: italic body, with a kind chip rendered inline by JS
// (no \q1 chip here — kind detection is on the row itself).
const POETRY_KINDS = [
    `${BLOCK}.kind-q`,
    `${BLOCK}.kind-q1`,
    `${BLOCK}.kind-q2`,
    `${BLOCK}.kind-q3`,
    `${BLOCK}.kind-q4`,
    `${BLOCK}.kind-qa`,
    `${BLOCK}.kind-qc`,
    `${BLOCK}.kind-qm`,
    `${BLOCK}.kind-qm1`,
    `${BLOCK}.kind-qm2`,
    `${BLOCK}.kind-qm3`,
    `${BLOCK}.kind-qr`,
    `${BLOCK}.kind-qd`,
].join(", ");

// Poetry runs italicize their content. Applied to the textarea and
// the read-only fragment body — leaves the verse number gutter
// upright.
globalStyle(`:is(${POETRY_KINDS}) .${textarea}`, { fontStyle: "italic" });
globalStyle(`:is(${POETRY_KINDS}) .${readOnlyText}`, { fontStyle: "italic" });

// Heading typography for \s, \s1-4, \sr, \d, \r, \sp, \ms, etc.
const HEADING_KINDS = [
    `${BLOCK}.kind-s`,
    `${BLOCK}.kind-s1`,
    `${BLOCK}.kind-s2`,
    `${BLOCK}.kind-s3`,
    `${BLOCK}.kind-s4`,
    `${BLOCK}.kind-ms`,
    `${BLOCK}.kind-ms1`,
    `${BLOCK}.kind-ms2`,
    `${BLOCK}.kind-ms3`,
    `${BLOCK}.kind-ms4`,
    `${BLOCK}.kind-d`,
    `${BLOCK}.kind-r`,
    `${BLOCK}.kind-sp`,
    `${BLOCK}.kind-sr`,
    `${BLOCK}.kind-sd`,
    `${BLOCK}.kind-sd1`,
    `${BLOCK}.kind-sd2`,
    `${BLOCK}.kind-sd3`,
    `${BLOCK}.kind-sd4`,
    `${BLOCK}.kind-sb`,
    `${BLOCK}.kind-sts`,
].join(", ");

globalStyle(HEADING_KINDS, {
    fontWeight: 700,
    marginTop: "1.5rem",
    padding: "0 8px",
});
globalStyle(`:is(${HEADING_KINDS}) .${textarea}`, { fontWeight: 700 });
globalStyle(`:is(${HEADING_KINDS}) .${readOnlyText}`, { fontWeight: 700 });
