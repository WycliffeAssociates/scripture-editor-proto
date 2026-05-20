// formModeBlockTree.ts
//
// Block-first view model for form mode.
//
// USFM is a flat token stream where paragraph-class markers (\p, \q1, \s,
// etc.) and verse markers (\v) are orthogonal axes — a single verse can
// span many paragraph-class markers, and a single paragraph can hold
// multiple verses.

// Even though paragraph and verse axes are orthogonal, most parsers (including
// ours) return data grouped by paragraph, so this view follows the same shape
// for display. Paragraph-class markers form the top-level blocks; each block
// contains the verse fragments that fall within it.
//
// The transformation is purely presentational: `block.tokens` is a SLICE of
// the original flat token list, not a reconstruction from kind metadata.
// `flattenFormBlockTree(buildFormBlockTree(tokens)) === tokens` is therefore
// identity by construction. That's what makes mode-flip lossless without
// depending on a separate serializer: the bytes never leave the original list,
// they're just sliced and re-indexed. If a future change recomputes
// `block.tokens` from kind metadata, the invariant becomes "the serializer is
// faithful" instead, which is a different (and harder) guarantee.

import type { SerializedLexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    createSerializedUSFMTextNode,
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

/**
 * Discriminated tag describing how a block should be rendered. The
 * underlying USFM marker is preserved so callers can apply per-marker
 * styling (e.g. q-level indent staircase) without re-parsing.
 *
 * `implicit` covers chapter-framing content that exists in the token
 * stream but is NOT introduced by a paragraph-class marker. In
 * practice this is the run of tokens before the first paragraph-class
 * marker in a chapter — typically just `\c N` plus any whitespace.
 * Form mode renders implicit blocks as the "Chapter N" badge (or
 * nothing, if there's no chapter number to surface). Tokens still
 * round-trip; the block exists as a holder for them so the flat token
 * stream reconstructs exactly when leaving form mode.
 *
 * `paragraph`, `poetry`, `heading`, `rule`, `list` all carry their
 * leading marker (`\p`, `\q1`, `\s1`, `\b`, `\li1`, etc.) so callers
 * can switch on either the category (for typesetting) or the exact
 * marker (for kind-specific behavior).
 */
export type FormBlockKind =
    | { variant: "implicit" }
    | { variant: "paragraph"; marker: string }
    | { variant: "poetry"; marker: string }
    | { variant: "heading"; marker: string }
    | { variant: "rule"; marker: string }
    | { variant: "list"; marker: string };

/**
 * One verse-shaped slice of a block. A block can hold zero (rule blocks),
 * one (heading blocks, prelude-only paragraphs), or many fragments
 * (paragraphs containing multiple verses). `tokenIndices` are positions
 * into the parent block's `tokens`, used by edit primitives to splice
 * text without rescanning.
 */
export type FormVerseFragment = {
    id: string;
    /** Verse SID (`"REV 1:3"`) or null for a fragment with no preceding `\v`. */
    sid: string | null;
    verseNumber: string | null;
    /** True only on the first fragment of any new verse run across the chapter. */
    isFirstOfVerse: boolean;
    text: string;
    tokenIndices: number[];
    /** Index of the `\v` marker token in the parent block; null if no verse. */
    markerTokenIndex: number | null;
};

/**
 * One paragraph-class block in source order. Concatenating every block's
 * `tokens` (in order) reproduces the input flat token stream — that's the
 * round-trip invariant.
 */
export type FormBlock = {
    id: string;
    kind: FormBlockKind;
    tokens: SerializedLexicalNode[];
    fragments: FormVerseFragment[];
};

// USFM 3.x paragraph-class markers, grouped by visual role. Anything not
// listed here is treated as inline (kept inside the current block) so
// unknown markers degrade gracefully and round-trip stays exact.
const POETRY_MARKERS = new Set([
    "q",
    "q1",
    "q2",
    "q3",
    "q4",
    "qa",
    "qc",
    "qm",
    "qm1",
    "qm2",
    "qm3",
    "qr",
    "qd",
]);

const HEADING_MARKERS = new Set([
    "s",
    "s1",
    "s2",
    "s3",
    "s4",
    "sr",
    "sd",
    "sd1",
    "sd2",
    "sd3",
    "sd4",
    "sp",
    "ms",
    "ms1",
    "ms2",
    "ms3",
    "ms4",
    "mr",
    "r",
    "d",
    "sb",
    "sts",
]);

const RULE_MARKERS = new Set(["b", "pb"]);

const LIST_MARKERS = new Set([
    "li",
    "li1",
    "li2",
    "li3",
    "li4",
    "litl",
    "lim",
    "lim1",
    "lim2",
    "lim3",
    "lim4",
]);

const PARAGRAPH_MARKERS = new Set([
    "p",
    "m",
    "mi",
    "nb",
    "cls",
    "lh",
    "lf",
    "lit",
    "pi",
    "pi1",
    "pi2",
    "pi3",
    "pc",
    "pmo",
    "pm",
    "pmc",
    "pmr",
    "pr",
    "ph",
    "ph1",
    "ph2",
    "ph3",
    "hl",
    "no",
]);

/**
 * Derive a block's `kind` from its head token. Used by renderers that
 * receive raw `block.tokens` and need to apply per-kind styling without
 * depending on the kind being separately persisted.
 */
export function deriveBlockKind(
    tokens: readonly SerializedLexicalNode[],
): FormBlockKind {
    const head = tokens[0];
    if (!head) return { variant: "implicit" };
    if (
        isSerializedUSFMTextNode(head) &&
        head.tokenType === UsfmTokenTypes.marker &&
        typeof head.marker === "string"
    ) {
        return classifyMarker(head.marker) ?? { variant: "implicit" };
    }
    return { variant: "implicit" };
}

/**
 * Maps a marker name to its block kind, or null when the marker is not
 * paragraph-class (and therefore should not start a new block).
 */
function classifyMarker(marker: string): FormBlockKind | null {
    if (POETRY_MARKERS.has(marker)) return { variant: "poetry", marker };
    if (HEADING_MARKERS.has(marker)) return { variant: "heading", marker };
    if (RULE_MARKERS.has(marker)) return { variant: "rule", marker };
    if (LIST_MARKERS.has(marker)) return { variant: "list", marker };
    if (PARAGRAPH_MARKERS.has(marker)) return { variant: "paragraph", marker };
    return null;
}

/**
 * Card-eligibility: blocks that render with the form-mode "white
 * card" surface. Headings, rules (`\b`/`\pb`), and implicit chapter
 * framing are NOT card-eligible — they render as their own
 * affordances (heading typography, hidden, chapter badge
 * respectively) and act as separators between adjacent cards.
 *
 * In USFM terms: `\p`/`\m`/`\mi`/`\pi*`/`\pmo`/etc. (paragraph),
 * `\q`/`\q1`-`\q4`/`\qm*`/`\qa`/`\qc`/`\qr`/`\qd` (poetry), and
 * `\li*`/`\lim*` (list) all paint a card. Anything else doesn't.
 */
function isCardEligibleKind(kind: FormBlockKind | null): boolean {
    return (
        kind?.variant === "paragraph" ||
        kind?.variant === "poetry" ||
        kind?.variant === "list"
    );
}

/**
 * Continuation relationship: does `ownKind` visually FLOW INTO the
 * predecessor's card (no top margin, no top radii, shared white
 * surface)? Mirrors the `CONTINUATION_PAIRS` list in
 * `formBlock.css.ts`.
 *
 * USFM scenarios where this returns TRUE:
 *   - `\p` followed by `\q`/`\q1`/`\q2`...  ← poetry stanza inside
 *     the paragraph
 *   - `\q1` followed by `\q2` (or any poetry → poetry) ← stanza chain
 *   - `\li1` followed by `\q1` ← poetry inside a list item
 *
 * USFM scenarios where this returns FALSE (= card break):
 *   - `\p` followed by `\p` ← two distinct paragraphs (Combine pill
 *     can merge them on demand)
 *   - `\q*` followed by `\p` ← back to prose, but a NEW prose card
 *     (matches the designer's "each \p is its own card")
 *   - anything after a heading, rule, or implicit block (those are
 *     always separators)
 *
 * Keep this function and the CSS `CONTINUATION_PAIRS` array in sync.
 */
function isContinuationOfPrev(
    ownKind: FormBlockKind,
    previousVisibleKind: FormBlockKind | null,
): boolean {
    if (ownKind.variant !== "poetry") return false;
    return (
        previousVisibleKind?.variant === "paragraph" ||
        previousVisibleKind?.variant === "poetry" ||
        previousVisibleKind?.variant === "list"
    );
}

/**
 * Whether a "Combine" affordance is meaningful between this block
 * and its previous visible sibling: BOTH must be card-eligible (so
 * there's something to merge into something else) AND they must NOT
 * already be in a continuation relationship (since continuation
 * already merges them visually — there's no separate card to
 * combine). Examples:
 *   - `\p` followed by `\p`: TRUE — two distinct prose paragraphs
 *   - `\q2` followed by `\q1` after a split: TRUE — manual stanza
 *     break the user might want to undo
 *   - `\p` followed by `\q1`: FALSE — already continuation
 *   - `\s1` followed by `\p`: FALSE — heading isn't card-eligible
 */
export function canCombineCardWithPrevious(
    ownKind: FormBlockKind,
    previousVisibleKind: FormBlockKind | null,
): boolean {
    return (
        isCardEligibleKind(ownKind) &&
        isCardEligibleKind(previousVisibleKind) &&
        !isContinuationOfPrev(ownKind, previousVisibleKind)
    );
}

function isMarker(node: SerializedLexicalNode): node is SerializedUSFMTextNode {
    return (
        isSerializedUSFMTextNode(node) &&
        node.tokenType === UsfmTokenTypes.marker &&
        typeof node.marker === "string"
    );
}

function isVerseMarker(node: SerializedLexicalNode): boolean {
    return isMarker(node) && node.marker === "v";
}

function isNumberRange(
    node: SerializedLexicalNode,
): node is SerializedUSFMTextNode {
    return (
        isSerializedUSFMTextNode(node) &&
        node.tokenType === UsfmTokenTypes.numberRange
    );
}

function isText(node: SerializedLexicalNode): node is SerializedUSFMTextNode {
    return (
        isSerializedUSFMTextNode(node) && node.tokenType === UsfmTokenTypes.text
    );
}

function isLinebreak(node: SerializedLexicalNode): boolean {
    return node.type === "linebreak";
}

/**
 * Split a chapter's flat token stream into paragraph-class blocks. The
 * leading `implicit` block holds anything before the first paragraph
 * marker (typically the `\c` chapter header).
 */
export function buildFormBlockTree(
    flatTokens: readonly SerializedLexicalNode[],
): FormBlock[] {
    const blocks: FormBlock[] = [];
    let currentTokens: SerializedLexicalNode[] = [];
    let currentKind: FormBlockKind = { variant: "implicit" };

    const closeCurrent = () => {
        if (currentTokens.length === 0) return;
        blocks.push({
            id: guidGenerator(),
            kind: currentKind,
            tokens: currentTokens,
            fragments: [],
        });
        currentTokens = [];
    };

    for (const token of flatTokens) {
        if (isMarker(token) && token.marker) {
            const nextKind = classifyMarker(token.marker);
            if (nextKind !== null) {
                closeCurrent();
                currentKind = nextKind;
            }
        }
        currentTokens.push(token);
    }
    closeCurrent();

    for (const block of blocks) {
        block.fragments = extractFragmentsFromBlock(block.tokens, block.id);
    }
    annotateFirstOfVerse(blocks);

    return blocks;
}

/**
 * Reverse of `buildFormBlockTree`. Concatenates each block's tokens in
 * source order. Round-trip identity holds when no block was mutated:
 * `flattenFormBlockTree(buildFormBlockTree(x)) === x` (token-by-token).
 */
export function flattenFormBlockTree(
    blocks: readonly FormBlock[],
): SerializedLexicalNode[] {
    const out: SerializedLexicalNode[] = [];
    for (const block of blocks) {
        for (const token of block.tokens) {
            out.push(token);
        }
    }
    return out;
}

/**
 * Walks one block and produces its verse fragments. Block-framing tokens
 * (the leading paragraph-class marker and any immediately-following
 * linebreaks) are skipped — they belong to the block as a whole, not to
 * any single fragment.
 */
export function extractFragmentsFromBlock(
    blockTokens: readonly SerializedLexicalNode[],
    blockId: string,
    /**
     * SID of the most recent verse seen in *preceding* blocks. Lets a
     * block that has no `\v` of its own (e.g. a `\q1` continuing the
     * previous block's verse) tag its prelude fragment with the right
     * verse SID, so cross-pane focus alignment can find it.
     */
    inheritedSid: string | null = null,
): FormVerseFragment[] {
    const fragments: FormVerseFragment[] = [];
    const framingEnd = computeFramingEnd(blockTokens);

    let current: FormVerseFragment | null = null;
    const closeCurrent = () => {
        if (current === null) return;
        fragments.push(current);
        current = null;
    };

    for (let i = framingEnd; i < blockTokens.length; i++) {
        const token = blockTokens[i] as SerializedLexicalNode;

        if (isMarker(token) && isVerseMarker(token)) {
            closeCurrent();
            current = startVerseFragment(
                blockId,
                fragments.length,
                token,
                blockTokens,
                i,
            );
            current.tokenIndices.push(i);
            continue;
        }

        if (current === null) {
            current = startPreludeFragment(blockId, fragments.length);
            current.sid = inheritedSid;
        }

        current.tokenIndices.push(i);
        appendTokenToFragmentText(current, token, blockTokens, i);
    }

    closeCurrent();
    if (fragments.length === 0 && shouldHaveTypingPlaceholder(blockTokens)) {
        // Block has no fragments — typically a freshly-inserted empty
        // paragraph-class block whose only tokens are the leading marker
        // and a linebreak. Synthesize a placeholder so the renderer can
        // show the kind header + an empty textarea to type into. The
        // placeholder has no tokenIndices, so the first edit triggers
        // `replaceFragmentText`'s append-new-token branch and the text
        // becomes a real text token in the slice. Rule and implicit
        // blocks skip this — they have no editable surface to host a
        // placeholder.
        fragments.push({
            id: `${blockId}-frag-empty`,
            sid: inheritedSid,
            verseNumber: null,
            isFirstOfVerse: false,
            text: "",
            tokenIndices: [],
            markerTokenIndex: null,
        });
    }
    annotateFirstOfVerseLocal(fragments);
    return fragments;
}

function shouldHaveTypingPlaceholder(
    blockTokens: readonly SerializedLexicalNode[],
): boolean {
    const kind = deriveBlockKind(blockTokens);
    return kind.variant !== "rule" && kind.variant !== "implicit";
}

/**
 * Per-block stamp of `isFirstOfVerse`: the first fragment of any new
 * SID in this block. Note this can over-stamp compared to the
 * chapter-wide pass in `annotateFirstOfVerse` (a verse spanning two
 * blocks is stamped once per block). Callers that want chapter-perfect
 * stamping should use `buildFormBlockTree` instead.
 */
function annotateFirstOfVerseLocal(
    fragments: readonly FormVerseFragment[],
): void {
    let prevSid: string | null = null;
    for (const fragment of fragments) {
        if (fragment.sid !== null && fragment.sid !== prevSid) {
            fragment.isFirstOfVerse = true;
            prevSid = fragment.sid;
        }
    }
}

/**
 * Block framing: the leading paragraph-class marker (if any) plus any
 * immediately-following linebreaks. These are part of `block.tokens` for
 * round-trip but are not assigned to any fragment.
 */
export function computeFramingEnd(
    blockTokens: readonly SerializedLexicalNode[],
): number {
    if (blockTokens.length === 0) return 0;
    const head = blockTokens[0];
    let cursor = 0;
    if (head && isMarker(head) && classifyMarker(head.marker ?? "") !== null) {
        cursor = 1;
        while (cursor < blockTokens.length) {
            const next = blockTokens[cursor];
            if (!next || !isLinebreak(next)) break;
            cursor++;
        }
    }
    return cursor;
}

function startVerseFragment(
    blockId: string,
    index: number,
    verseToken: SerializedUSFMTextNode,
    blockTokens: readonly SerializedLexicalNode[],
    verseTokenIndex: number,
): FormVerseFragment {
    const next = blockTokens[verseTokenIndex + 1];
    const verseNumber =
        next && isNumberRange(next) ? (next.text ?? "").trim() : null;
    return {
        id: `${blockId}-frag-${index}`,
        sid: verseToken.sid ?? null,
        verseNumber: verseNumber || null,
        isFirstOfVerse: false,
        text: "",
        tokenIndices: [],
        markerTokenIndex: verseTokenIndex,
    };
}

function startPreludeFragment(
    blockId: string,
    index: number,
): FormVerseFragment {
    return {
        id: `${blockId}-frag-${index}`,
        sid: null,
        verseNumber: null,
        isFirstOfVerse: false,
        text: "",
        tokenIndices: [],
        markerTokenIndex: null,
    };
}

/**
 * Adds a token's visible content to a fragment's text. Verse-number
 * ranges are skipped so the verse number doesn't get inlined into the
 * fragment body — it's surfaced separately on the fragment.
 */
function appendTokenToFragmentText(
    fragment: FormVerseFragment,
    token: SerializedLexicalNode,
    blockTokens: readonly SerializedLexicalNode[],
    index: number,
): void {
    if (isLinebreak(token)) {
        fragment.text += " ";
        return;
    }
    if (!isText(token) && !isNumberRange(token)) return;

    const prev = blockTokens[index - 1];
    const isVerseHeaderNumber =
        isNumberRange(token) && prev !== undefined && isVerseMarker(prev);
    if (isVerseHeaderNumber) return;

    fragment.text += (token as SerializedUSFMTextNode).text ?? "";
}

/**
 * Marks the first fragment of each new verse-run (across all blocks) so
 * the renderer can stamp the verse chip exactly once per verse, no
 * matter how many blocks the verse spans.
 */
function annotateFirstOfVerse(blocks: readonly FormBlock[]): void {
    let prevSid: string | null = null;
    for (const block of blocks) {
        for (const fragment of block.fragments) {
            if (fragment.sid !== null && fragment.sid !== prevSid) {
                fragment.isFirstOfVerse = true;
                prevSid = fragment.sid;
            }
        }
    }
}

// --- Pending-focus coordination ---------------------------------------
//
// When the user clicks `+` to insert a new block, we want the new
// block's textarea to receive focus on mount so they can start typing
// immediately. Insert handlers call `markBlockPendingFocus(id)`; the
// FragmentCard inside the new block calls `consumePendingFocus(id)` in
// a mount-only effect and focuses its textarea iff true was returned.
// The state is module-local because it lives only for the gap between
// the editor update that creates the node and the React mount that
// follows — no React context plumbing required.
/**
 * Where in the block to land focus:
 *   - "first" → first fragment (used by split-before so the user lands
 *     on the fragment that just moved into the new block — the part
 *     that visibly changed under their cursor).
 *   - "last"  → last fragment (used by verse-append so they land on
 *     the freshly-inserted verse rather than the existing one above).
 *   - number  → a specific 0-indexed fragment (used by within-block
 *     verse-insert so focus lands on the new fragment we wedged in).
 */
export type PendingFocusPosition = "first" | "last" | number;
const PENDING_FOCUS: Map<string, PendingFocusPosition> = new Map();

export function markBlockPendingFocus(
    blockId: string,
    position: PendingFocusPosition = "last",
): void {
    PENDING_FOCUS.set(blockId, position);
}

export function peekPendingFocus(blockId: string): PendingFocusPosition | null {
    return PENDING_FOCUS.get(blockId) ?? null;
}

export function consumePendingFocus(
    blockId: string,
): PendingFocusPosition | null {
    const value = PENDING_FOCUS.get(blockId);
    if (value === undefined) return null;
    PENDING_FOCUS.delete(blockId);
    return value;
}

/**
 * Splice a fragment's text content with a new value. Drops the fragment's
 * existing visible text tokens and inserts a single text token in their
 * place. Returns the block's new tokens — caller decides how to write
 * back (typically into the FormBlockNode that owns the block).
 *
 * The fragment's verse marker, number-range, and any character markers
 * inside the fragment are left in place. Linebreaks inside the
 * fragment's range are preserved as well; only `text` tokens get
 * collapsed into the replacement.
 */
export function replaceFragmentText(
    blockTokens: readonly SerializedLexicalNode[],
    fragment: FormVerseFragment,
    nextText: string,
    sidHint: string,
): SerializedLexicalNode[] {
    const dropIndices = collectTextIndicesToDrop(blockTokens, fragment);
    const insertionAnchor = computeInsertionAnchor(
        fragment,
        blockTokens.length,
    );
    const replacement =
        nextText.length > 0
            ? createReplacementTextToken(fragment, nextText, sidHint)
            : null;

    return rebuildTokensWithReplacement(
        blockTokens,
        dropIndices,
        insertionAnchor,
        replacement,
    );
}

/**
 * Indices of `text` tokens in this fragment's range, which is what we
 * collapse on edit. Linebreaks and character markers stay because they
 * carry structural meaning.
 */
function collectTextIndicesToDrop(
    blockTokens: readonly SerializedLexicalNode[],
    fragment: FormVerseFragment,
): Set<number> {
    const drop = new Set<number>();
    for (const i of fragment.tokenIndices) {
        const token = blockTokens[i];
        if (!token) continue;
        if (
            isSerializedUSFMTextNode(token) &&
            token.tokenType === UsfmTokenTypes.text
        ) {
            drop.add(i);
        }
    }
    return drop;
}

/**
 * Position in `block.tokens` to splice the new text token at: just after
 * the fragment's verse-number range (if any), otherwise just after the
 * verse marker, otherwise at the fragment's first token. For prelude
 * fragments (no verse marker) the anchor is the first index in range.
 */
function computeInsertionAnchor(
    fragment: FormVerseFragment,
    blockTokensLength: number,
): number {
    if (fragment.markerTokenIndex === null) {
        return fragment.tokenIndices[0] ?? blockTokensLength;
    }
    return fragment.markerTokenIndex + 2;
}

function createReplacementTextToken(
    fragment: FormVerseFragment,
    nextText: string,
    sidHint: string,
): SerializedUSFMTextNode {
    const leadingSpace = fragment.markerTokenIndex !== null ? " " : "";
    return createSerializedUSFMTextNode({
        text: `${leadingSpace}${nextText}`,
        id: guidGenerator(),
        sid: fragment.sid ?? sidHint,
        tokenType: UsfmTokenTypes.text,
    });
}

/**
 * Synthesize the minimum tokens for a fresh paragraph-class block: a
 * leading marker token and a trailing linebreak. Used by both the
 * between-block insert (creates a new sibling block) and the
 * within-block split (prepended to the spilled-over fragments to start
 * the new sibling).
 */
export function buildEmptyBlockTokens(marker: string): SerializedLexicalNode[] {
    return [
        createSerializedUSFMTextNode({
            text: `\\${marker} `,
            id: guidGenerator(),
            sid: "",
            tokenType: UsfmTokenTypes.marker,
            marker,
            inPara: marker,
        }),
        { type: "linebreak", version: 1 } as SerializedLexicalNode,
    ];
}

/**
 * Replace the leading paragraph-class marker of a block with a new
 * marker. Used by the segmented toggle that lets the user flip a
 * block between `\p` / `\m` / `\q1` / `\q2`. The rest of the tokens
 * (verse markers, text, character markers) are left alone.
 *
 * Returns null if the block doesn't have a leading paragraph-class
 * marker to replace (caller bails — no toggle should be visible in
 * that case).
 */
export function setBlockMarker(
    blockTokens: readonly SerializedLexicalNode[],
    nextMarker: string,
): SerializedLexicalNode[] | null {
    const head = blockTokens[0];
    if (!head || !isSerializedUSFMTextNode(head)) return null;
    if (head.tokenType !== UsfmTokenTypes.marker) return null;
    if (!head.marker || classifyMarker(head.marker) === null) return null;

    const replacement = createSerializedUSFMTextNode({
        text: `\\${nextMarker} `,
        id: head.id ?? guidGenerator(),
        sid: head.sid ?? "",
        tokenType: UsfmTokenTypes.marker,
        marker: nextMarker,
        inPara: nextMarker,
    });
    return [replacement, ...blockTokens.slice(1)];
}

/**
 * Look for a `\c` marker in `tokens`; return the chapter number from
 * the immediately-following numberRange if present. Used to render the
 * chapter prelude block as a "Chapter N" badge instead of leaving it
 * invisible.
 */
export function findChapterNumber(
    tokens: readonly SerializedLexicalNode[],
): string | null {
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (
            !isSerializedUSFMTextNode(token) ||
            token.tokenType !== UsfmTokenTypes.marker ||
            token.marker !== "c"
        ) {
            continue;
        }
        const next = tokens[i + 1];
        if (
            isSerializedUSFMTextNode(next) &&
            next.tokenType === UsfmTokenTypes.numberRange
        ) {
            return (next.text ?? "").trim();
        }
    }
    return null;
}

/**
 * Drop a fragment's tokens from a block. Used by the "Delete verse"
 * action — removes the verse marker, its number range, and any text
 * tokens belonging to that verse, leaving the rest of the block
 * (framing + other verse fragments) intact.
 */
export function removeFragmentFromBlock(
    blockTokens: readonly SerializedLexicalNode[],
    fragment: FormVerseFragment,
): SerializedLexicalNode[] {
    if (fragment.tokenIndices.length === 0) return [...blockTokens];
    const drop = new Set(fragment.tokenIndices);
    return blockTokens.filter((_, i) => !drop.has(i));
}

/**
 * Last verse SID found in a token slice — used to anchor a freshly-
 * inserted verse to the right book/chapter and number.
 */
export function findLastVerseSid(
    tokens: readonly SerializedLexicalNode[],
): string | null {
    let last: string | null = null;
    for (const token of tokens) {
        if (
            isSerializedUSFMTextNode(token) &&
            token.tokenType === UsfmTokenTypes.marker &&
            token.marker === "v" &&
            token.sid
        ) {
            last = token.sid;
        }
    }
    return last;
}

/**
 * Tokens for a verse fragment to append into an existing block:
 * verse marker + numberRange + linebreak. Used by the "+ verse" path
 * which adds a verse to the current paragraph-class block rather than
 * wrapping it in a fresh `\p`.
 */
export function buildVerseFragmentTokens(
    nextSid: string,
    nextNumber: number,
): SerializedLexicalNode[] {
    return [
        createSerializedUSFMTextNode({
            text: `\\v `,
            id: guidGenerator(),
            sid: nextSid,
            tokenType: UsfmTokenTypes.marker,
            marker: "v",
        }),
        createSerializedUSFMTextNode({
            text: String(nextNumber),
            id: guidGenerator(),
            sid: nextSid,
            tokenType: UsfmTokenTypes.numberRange,
            marker: "v",
        }),
        { type: "linebreak", version: 1 } as SerializedLexicalNode,
    ];
}

/**
 * Pick the next verse SID + number when the user inserts a verse after
 * `anchorSid`. Returns null when the anchor's SID can't be parsed
 * (caller bails). Doesn't check for collisions — caller can validate.
 */
export function nextVerseSidFrom(
    anchorSid: string,
): { sid: string; number: number } | null {
    const parsed = parseSid(anchorSid);
    if (!parsed) return null;
    const nextNumber = (parsed.verseEnd || parsed.verseStart) + 1;
    return {
        sid: `${parsed.book} ${parsed.chapter}:${nextNumber}`,
        number: nextNumber,
    };
}

/**
 * Split a block's tokens at the given fragment. Caller uses this to
 * turn one block into two when the user inserts a new paragraph-class
 * marker between two existing fragments. The new block's tokens lead
 * with `newBlockMarker`'s framing then continue with the remainder of
 * the original tokens from the fragment forward.
 *
 * Returns null when the fragment doesn't carry any tokens to split on
 * (defensive — shouldn't happen for fragments produced by
 * `extractFragmentsFromBlock`).
 */
/**
 * Insert a verse-fragment (`\v N \n`) into a block immediately *before*
 * the given fragment. Used when the user clicks a within-block `+` and
 * picks "Verse" — semantically that's "give me a new verse fragment
 * here, in this same paragraph", not "split the paragraph". The
 * paragraph-class marker (and all preceding fragments) stay as-is; the
 * new verse fragment slots in front of `fragment`'s first token.
 *
 * Returns null if the fragment lacks token indices (shouldn't happen
 * for fragments produced by `extractFragmentsFromBlock`).
 */
export function insertVerseFragmentBeforeFragment(
    blockTokens: readonly SerializedLexicalNode[],
    fragment: FormVerseFragment,
    verseTokens: readonly SerializedLexicalNode[],
): SerializedLexicalNode[] | null {
    const insertIndex = fragment.tokenIndices[0];
    if (insertIndex === undefined) return null;
    return [
        ...blockTokens.slice(0, insertIndex),
        ...verseTokens,
        ...blockTokens.slice(insertIndex),
    ];
}

export function splitBlockAtFragment(
    blockTokens: readonly SerializedLexicalNode[],
    fragment: FormVerseFragment,
    newBlockMarker: string,
): { before: SerializedLexicalNode[]; after: SerializedLexicalNode[] } | null {
    const splitIndex = fragment.tokenIndices[0];
    if (splitIndex === undefined) return null;
    const before = blockTokens.slice(0, splitIndex);
    const remaining = blockTokens.slice(splitIndex);
    const after = [...buildEmptyBlockTokens(newBlockMarker), ...remaining];
    return { before, after };
}

/**
 * Insert a verse fragment in the *middle* of an existing fragment's
 * text. The user's intended UX: right-click in the textarea at a
 * specific position, pick "Verse" → the text splits at the cursor;
 * the part before stays on the current verse, the part after becomes
 * the new verse's content.
 *
 * Truncates the current fragment to `beforeText` and inserts new
 * verse-fragment tokens (marker + numberRange + nl + optional
 * text(afterText) + nl) immediately after the current fragment's last
 * token.
 */
export function insertVerseAtCursor(
    blockTokens: readonly SerializedLexicalNode[],
    fragment: FormVerseFragment,
    cursorOffset: number,
    nextSid: string,
    nextNumber: number,
): SerializedLexicalNode[] | null {
    const lastIndex = fragment.tokenIndices[fragment.tokenIndices.length - 1];
    if (lastIndex === undefined) return null;
    const beforeText = fragment.text.slice(0, cursorOffset);
    const afterText = fragment.text.slice(cursorOffset);
    const truncated = replaceFragmentText(
        blockTokens,
        fragment,
        beforeText,
        fragment.sid ?? "",
    );
    // The truncated array shares the same suffix structure as the
    // input — only the text token(s) inside the fragment changed.
    // Re-extract to find the *now*-current fragment so we know where
    // to splice. Cheap because parsing one block is bounded.
    const refreshedFragments = extractFragmentsFromBlock(
        truncated,
        "tmp",
        fragment.sid,
    );
    const refreshed = refreshedFragments.find(
        (f) => f.markerTokenIndex === fragment.markerTokenIndex,
    );
    const refreshedLast =
        refreshed?.tokenIndices[refreshed.tokenIndices.length - 1];
    if (refreshedLast === undefined) return null;
    const newVerseTokens: SerializedLexicalNode[] = [
        ...buildVerseFragmentTokens(nextSid, nextNumber),
    ];
    if (afterText.length > 0) {
        newVerseTokens.push(
            createSerializedUSFMTextNode({
                text: ` ${afterText}`,
                id: guidGenerator(),
                sid: nextSid,
                tokenType: UsfmTokenTypes.text,
            }),
            { type: "linebreak", version: 1 } as SerializedLexicalNode,
        );
    }
    return [
        ...truncated.slice(0, refreshedLast + 1),
        ...newVerseTokens,
        ...truncated.slice(refreshedLast + 1),
    ];
}

/**
 * Split a block at an arbitrary cursor inside a fragment's text. The
 * `before` block keeps everything up to and including the truncated
 * current fragment; the `after` block leads with `newBlockMarker`
 * (paragraph or poetry) and contains the after-cursor text plus any
 * subsequent fragments.
 */
export function splitBlockAtCursor(
    blockTokens: readonly SerializedLexicalNode[],
    fragment: FormVerseFragment,
    cursorOffset: number,
    newBlockMarker: string,
): { before: SerializedLexicalNode[]; after: SerializedLexicalNode[] } | null {
    const lastIndex = fragment.tokenIndices[fragment.tokenIndices.length - 1];
    if (lastIndex === undefined) return null;
    const beforeText = fragment.text.slice(0, cursorOffset);
    const afterText = fragment.text.slice(cursorOffset);
    const truncated = replaceFragmentText(
        blockTokens,
        fragment,
        beforeText,
        fragment.sid ?? "",
    );
    const refreshedFragments = extractFragmentsFromBlock(
        truncated,
        "tmp",
        fragment.sid,
    );
    const refreshed = refreshedFragments.find(
        (f) => f.markerTokenIndex === fragment.markerTokenIndex,
    );
    const refreshedLast =
        refreshed?.tokenIndices[refreshed.tokenIndices.length - 1];
    if (refreshedLast === undefined) return null;
    const before = truncated.slice(0, refreshedLast + 1);
    const tail = truncated.slice(refreshedLast + 1);
    const after: SerializedLexicalNode[] = [
        ...buildEmptyBlockTokens(newBlockMarker),
    ];
    if (afterText.length > 0) {
        after.push(
            createSerializedUSFMTextNode({
                text: afterText,
                id: guidGenerator(),
                sid: fragment.sid ?? "",
                tokenType: UsfmTokenTypes.text,
            }),
            { type: "linebreak", version: 1 } as SerializedLexicalNode,
        );
    }
    after.push(...tail);
    return { before, after };
}

function rebuildTokensWithReplacement(
    blockTokens: readonly SerializedLexicalNode[],
    dropIndices: ReadonlySet<number>,
    insertionAnchor: number,
    replacement: SerializedUSFMTextNode | null,
): SerializedLexicalNode[] {
    const out: SerializedLexicalNode[] = [];
    let inserted = false;
    for (let i = 0; i < blockTokens.length; i++) {
        if (i === insertionAnchor && !inserted) {
            if (replacement) out.push(replacement);
            inserted = true;
        }
        if (dropIndices.has(i)) continue;
        out.push(blockTokens[i] as SerializedLexicalNode);
    }
    if (!inserted && replacement) out.push(replacement);
    return out;
}
