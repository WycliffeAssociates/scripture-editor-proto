// TODO: long file — findings-store-unification should shorten it; DOM utils
// could be extracted so the JSX reads cleaner.
/**
 * Snapshot-driven lint overlay.
 *
 * This plugin no longer decides which issues exist. It only takes the already-
 * committed visible lint snapshot, finds the best DOM anchor for each issue,
 * and keeps those affordances positioned while the document scrolls or reflows.
 *
 * Two affordances, chosen per issue by whether the flagged token is currently
 * rendered as visible text:
 *  - HIGHLIGHT — when the token's own element is on screen (text runs always;
 *    markers too, in USFM/plain mode). We draw a translucent highlight over its
 *    client rects (multi-line aware).
 *  - BADGE — when it isn't (e.g. a USFM marker hidden in regular/view mode). We
 *    fall back to the `!` badge at the next-best visible anchor (the verse
 *    number), exactly as before.
 *
 * Both open the same fix popover on hover.
 */
import type { LexicalEditor } from "lexical";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import {
    type ChapterLabelTally,
    findChapterLabelEntries,
    tallyChapterLabels,
} from "@/app/domain/editor/annotations/chapterLabelTally.ts";
import type { EditorAnnotation } from "@/app/domain/editor/annotations/editorAnnotation.ts";
import { lintIssuesToAnnotations } from "@/app/domain/editor/annotations/onionAnnotationProvider.tsx";
import { resolveContentRange } from "@/app/domain/editor/annotations/resolveContentRange.ts";
import { sousFindingsToAnnotations } from "@/app/domain/editor/annotations/sousAnnotationProvider.ts";
import { useEditorLintTooltip } from "@/app/domain/editor/hooks/useEditorLintTooltip.ts";
import { lexicalToTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { AnnotationPopover } from "@/app/ui/components/blocks/AnnotationPopover.tsx";
import { ChapterLabelPicker } from "@/app/ui/components/blocks/ChapterLabelPicker.tsx";
import { getLintIssueKey } from "@/app/ui/hooks/lintState.ts";
import { useLayoutTick } from "@/app/ui/hooks/useLayoutTick.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/LintDomOverlay.css.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

type Rect = { left: number; top: number; width: number; height: number };

type HighlightEntry = {
    kind: "highlight";
    key: string;
    dataId: string | null;
    dataSid: string | null;
    rects: Rect[];
    // Set for sous content findings: the rect itself is the hover target (it
    // carries `data-annotation-id`), keyed to this finding's exact range rather
    // than the shared underlying token.
    annotationId?: string;
};

type BadgeEntry = {
    kind: "badge";
    key: string;
    dataId: string | null;
    dataSid: string | null;
    left: number;
    top: number;
};

type OverlayEntry = HighlightEntry | BadgeEntry;

type AnchorRecord = {
    issueKey: string;
    anchorKey: string;
    issue: LintIssue;
    element: HTMLElement | null;
    kind: "highlight" | "badge" | "none";
    rects: Rect[];
    left: number;
    top: number;
    stale: boolean;
};

type DomLookup = {
    byDataId: Map<string, HTMLElement[]>;
    bySid: Map<string, HTMLElement[]>;
    renderedState: WeakMap<HTMLElement, boolean>;
};

const LINT_HITPOINT_ATTR = "data-lint-hitpoint";

function getAnchorKey(issue: LintIssue): string {
    if (issue.tokenId) return `token:${issue.tokenId}`;
    if (issue.relatedTokenId) return `related:${issue.relatedTokenId}`;
    if (issue.sid) return `sid:${issue.sid}`;
    return `fallback:${getLintIssueKey(issue)}`;
}

function getIssueCandidates(issue: LintIssue): string[] {
    const candidates: string[] = [];
    if (issue.tokenId) candidates.push(issue.tokenId);
    if (issue.relatedTokenId) candidates.push(issue.relatedTokenId);
    if (issue.sid) candidates.push(issue.sid);
    return candidates;
}

function isRenderedElement(el: HTMLElement): boolean {
    return Boolean(
        el.offsetWidth || el.offsetHeight || el.getClientRects().length,
    );
}

function isRenderedElementCached(
    cache: WeakMap<HTMLElement, boolean>,
    el: HTMLElement,
): boolean {
    const cached = cache.get(el);
    if (cached !== undefined) return cached;
    const next = isRenderedElement(el);
    cache.set(el, next);
    return next;
}

function buildDomLookup(root: HTMLElement): DomLookup {
    const byDataId = new Map<string, HTMLElement[]>();
    const bySid = new Map<string, HTMLElement[]>();
    const renderedState = new WeakMap<HTMLElement, boolean>();
    const candidates = root.querySelectorAll<HTMLElement>(
        "[data-id], [data-sid]",
    );

    for (const element of candidates) {
        const dataId = element.getAttribute("data-id");
        if (dataId) {
            const previous = byDataId.get(dataId);
            if (previous) previous.push(element);
            else byDataId.set(dataId, [element]);
        }

        const sid = element.getAttribute("data-sid");
        if (sid) {
            const previous = bySid.get(sid);
            if (previous) previous.push(element);
            else bySid.set(sid, [element]);
        }
    }

    return { byDataId, bySid, renderedState };
}

// The flagged token's OWN rendered element, if it is currently visible text.
// Presence of this is what decides highlight (here) vs badge (fallback).
function findDirectTokenElement(
    lookup: DomLookup,
    issue: LintIssue,
): HTMLElement | null {
    for (const id of [issue.tokenId, issue.relatedTokenId]) {
        if (!id) continue;
        for (const el of lookup.byDataId.get(id) ?? []) {
            if (isRenderedElementCached(lookup.renderedState, el)) return el;
        }
    }
    return null;
}

function findVisibleSiblingTarget(
    direct: HTMLElement,
    renderedState: WeakMap<HTMLElement, boolean>,
): HTMLElement | null {
    const tokenType = direct.getAttribute("data-token-type");
    const isHiddenMarkerTarget =
        tokenType === "marker" || tokenType === "endMarker";
    if (!isHiddenMarkerTarget) return direct;

    const acceptableTokenTypes = new Set(["numberRange", "text"]);
    let probe = direct.nextElementSibling as HTMLElement | null;
    while (probe) {
        if (probe.tagName === "BR") {
            probe = probe.nextElementSibling as HTMLElement | null;
            continue;
        }
        const probeTokenType = probe.getAttribute("data-token-type");
        if (
            probeTokenType &&
            acceptableTokenTypes.has(probeTokenType) &&
            isRenderedElementCached(renderedState, probe)
        ) {
            return probe;
        }
        probe = probe.nextElementSibling as HTMLElement | null;
    }

    probe = direct.previousElementSibling as HTMLElement | null;
    while (probe) {
        if (probe.tagName === "BR") {
            probe = probe.previousElementSibling as HTMLElement | null;
            continue;
        }
        const probeTokenType = probe.getAttribute("data-token-type");
        if (
            probeTokenType &&
            acceptableTokenTypes.has(probeTokenType) &&
            isRenderedElementCached(renderedState, probe)
        ) {
            return probe;
        }
        probe = probe.previousElementSibling as HTMLElement | null;
    }

    return direct;
}

// In usfm/plain mode, if we landed on the verse numberRange span, walk back to
// the \v marker so the badge sits left of the marker instead of the number.
function adjustAnchorForMode(
    el: HTMLElement,
    isRawMode: boolean,
    renderedState: WeakMap<HTMLElement, boolean>,
): HTMLElement {
    if (!isRawMode || el.getAttribute("data-token-type") !== "numberRange")
        return el;
    let probe = el.previousElementSibling as HTMLElement | null;
    while (probe) {
        if (probe.tagName === "BR") {
            probe = probe.previousElementSibling as HTMLElement | null;
            continue;
        }
        if (
            probe.getAttribute("data-token-type") === "marker" &&
            probe.getAttribute("data-marker") === "v" &&
            isRenderedElementCached(renderedState, probe)
        ) {
            return probe;
        }
        break;
    }
    return el;
}

// Best visible anchor for the BADGE fallback — used only when the flagged token
// itself isn't rendered. Walks markers → siblings → sid matches.
function findBestVisibleTarget(
    lookup: DomLookup,
    issue: LintIssue,
    editorMode: string,
): HTMLElement | null {
    const isRawMode =
        editorMode === EDITOR_MODES.usfm || editorMode === EDITOR_MODES.plain;

    for (const candidate of getIssueCandidates(issue)) {
        const directMatches = lookup.byDataId.get(candidate) ?? [];
        for (const match of directMatches) {
            const visible = isRenderedElementCached(lookup.renderedState, match)
                ? match
                : findVisibleSiblingTarget(match, lookup.renderedState);
            if (
                visible &&
                isRenderedElementCached(lookup.renderedState, visible)
            ) {
                return adjustAnchorForMode(
                    visible,
                    isRawMode,
                    lookup.renderedState,
                );
            }
        }

        const sidMatches = lookup.bySid.get(candidate) ?? [];
        if (sidMatches.length > 0) {
            const preferred = isRawMode
                ? sidMatches.find(
                      (el) =>
                          isRenderedElementCached(lookup.renderedState, el) &&
                          el.getAttribute("data-token-type") === "marker" &&
                          el.getAttribute("data-marker") === "v",
                  )
                : sidMatches.find(
                      (el) =>
                          isRenderedElementCached(lookup.renderedState, el) &&
                          el.getAttribute("data-token-type") === "numberRange",
                  );
            if (preferred) return preferred;

            const visible = sidMatches.find((el) =>
                isRenderedElementCached(lookup.renderedState, el),
            );
            if (visible)
                return adjustAnchorForMode(
                    visible,
                    isRawMode,
                    lookup.renderedState,
                );
        }
    }

    return null;
}

function measureAnchorRect(
    rootEl: HTMLElement,
    element: HTMLElement,
): DOMRect | null {
    const rootRect = rootEl.getBoundingClientRect();
    const rootOffsetLeft = rootEl.clientLeft;
    const rootOffsetTop = rootEl.clientTop;
    const rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;

    return new DOMRect(
        rect.left - rootRect.left + rootEl.scrollLeft - rootOffsetLeft,
        rect.top - rootRect.top + rootEl.scrollTop - rootOffsetTop,
        rect.width,
        rect.height,
    );
}

// Root-relative highlight boxes for a token element. Prose text uses
// getClientRects() so a multi-line run highlights per line; short single tokens
// (verse/chapter numbers, visible markers) use one bounding box to avoid stray
// per-fragment rects (e.g. a separate sliver over leading whitespace). Rects
// with no real area are dropped — an empty/hidden element yields none, which is
// the signal to fall back to the badge.
function measureHighlightRects(
    rootEl: HTMLElement,
    element: HTMLElement,
    perLine: boolean,
): Rect[] {
    const rootRect = rootEl.getBoundingClientRect();
    const rootOffsetLeft = rootEl.clientLeft;
    const rootOffsetTop = rootEl.clientTop;
    const domRects = perLine
        ? Array.from(element.getClientRects())
        : [element.getBoundingClientRect()];
    const out: Rect[] = [];
    for (const rect of domRects) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        out.push({
            left:
                rect.left - rootRect.left + rootEl.scrollLeft - rootOffsetLeft,
            top: rect.top - rootRect.top + rootEl.scrollTop - rootOffsetTop,
            width: rect.width,
            height: rect.height,
        });
    }
    return out;
}

function syncHitpointAttributes(
    previous: Set<HTMLElement>,
    next: Set<HTMLElement>,
) {
    for (const element of previous) {
        if (!next.has(element)) {
            element.removeAttribute(LINT_HITPOINT_ATTR);
        }
    }
    for (const element of next) {
        if (!previous.has(element)) {
            element.setAttribute(LINT_HITPOINT_ATTR, "true");
        }
    }
}

function publishEntries(
    records: Map<string, AnchorRecord>,
    setEntries: (entries: OverlayEntry[]) => void,
    activeHitpointsRef: { current: Set<HTMLElement> },
    // sous content findings resolve to their own highlight entries + hover
    // hitpoints (the underlying token elements); merge them with the lint set.
    extraEntries: OverlayEntry[] = [],
    extraHitpoints: Set<HTMLElement> = new Set(),
) {
    const entries: OverlayEntry[] = [...extraEntries];
    const nextHitpoints = new Set<HTMLElement>(extraHitpoints);

    for (const record of records.values()) {
        if (record.stale || !record.element || record.kind === "none") continue;

        const dataId =
            record.element.getAttribute("data-id") ??
            record.issue.tokenId ??
            null;
        const dataSid =
            record.element.getAttribute("data-sid") ?? record.issue.sid ?? null;

        if (record.kind === "highlight" && record.rects.length > 0) {
            // The highlight box is click-through, so the underlying token is
            // the hover target — mark it with data-lint-hitpoint.
            nextHitpoints.add(record.element);
            entries.push({
                kind: "highlight",
                key: record.issueKey,
                dataId,
                dataSid,
                rects: record.rects,
            });
        } else if (record.kind === "badge") {
            // The badge overlay itself is the hover target (data-js); we do NOT
            // mark the fallback anchor (e.g. a valid verse number) as a
            // hitpoint, so hovering it doesn't open an unrelated issue.
            entries.push({
                kind: "badge",
                key: record.issueKey,
                dataId,
                dataSid,
                left: record.left,
                top: record.top,
            });
        }
    }

    syncHitpointAttributes(activeHitpointsRef.current, nextHitpoints);
    activeHitpointsRef.current = nextHitpoints;
    setEntries(entries);
}

type LintDomAnnotatorPluginProps = {
    editor: LexicalEditor;
};

export function LintDomAnnotatorPlugin({
    editor,
}: LintDomAnnotatorPluginProps) {
    const {
        actions,
        lint,
        project,
        layoutTickStore,
        workingFilesStore,
        sousFindingsStore,
    } = useWorkspaceContext();
    const editorMode = project.appSettings.editorMode;
    const tick = useLayoutTick(layoutTickStore);
    const [rootEl, setRootEl] = useState<HTMLElement | null>(null);
    const rootElRef = useRef<HTMLElement | null>(null);
    rootElRef.current = rootEl;
    const [entries, setEntries] = useState<OverlayEntry[]>([]);
    const editorModeRef = useRef(editorMode);
    editorModeRef.current = editorMode;
    const recordsRef = useRef<Map<string, AnchorRecord>>(new Map());
    const hitpointsRef = useRef<Set<HTMLElement>>(new Set());
    const resolveAnchorsRef = useRef<(() => void) | null>(null);
    // Project-wide chapter-label standardize picker. The tally is derived from
    // the committed working files only when the user opens the picker (a click,
    // not a hover), so the hover path stays cheap.
    const [chapterLabelTally, setChapterLabelTally] =
        useState<ChapterLabelTally | null>(null);
    const openChapterLabelPicker = useCallback(() => {
        const tokens = workingFilesStore.read().flatMap((book) =>
            book.chapters.flatMap((chapter) =>
                lexicalToTokens(chapter.lexicalState, {
                    bookCode: book.bookCode,
                }),
            ),
        );
        setChapterLabelTally(
            tallyChapterLabels(findChapterLabelEntries(tokens)),
        );
    }, [workingFilesStore]);

    // --- the annotation zip (Phase 3): onion lint + sous content findings ---
    //
    // Both sources normalize to `EditorAnnotation` and merge by the token-ids
    // each touches; the hover lookup then returns both streams for a hovered
    // token. onion lint issues for the visible scope, normalized once and held
    // in a ref the (event-time) hover lookup reads.
    const lintAnnotations = useMemo(
        () =>
            lintIssuesToAnnotations(lint.filteredVisibleIssues, {
                applyFix: actions.fixLintError,
                onStandardizeChapterLabels: openChapterLabelPicker,
            }),
        [
            lint.filteredVisibleIssues,
            actions.fixLintError,
            openChapterLabelPicker,
        ],
    );
    const lintAnnotationsRef = useRef(lintAnnotations);
    lintAnnotationsRef.current = lintAnnotations;

    // sous content findings for the visible book + the vref segment map that
    // resolves their ranges to DOM rects.
    const sousResults = useSyncExternalStore(
        sousFindingsStore.subscribe,
        sousFindingsStore.getSnapshot,
    );
    const sousResult = sousResults[project.pickedFile.bookCode.toUpperCase()];
    const sousAnnotations = useMemo(
        () =>
            sousResult ? sousFindingsToAnnotations(sousResult.findings) : [],
        [sousResult],
    );
    const sousAnnotationsRef = useRef(sousAnnotations);
    sousAnnotationsRef.current = sousAnnotations;
    const sousSegmentsRef = useRef(sousResult?.segments ?? {});
    sousSegmentsRef.current = sousResult?.segments ?? {};
    // finding-id -> annotation, for the hover lookup. Content findings hover off
    // their own highlight rect (which carries `data-annotation-id`), so the
    // lookup keys by finding id — not the shared token — keeping multiple
    // findings in one token independently hoverable.
    const sousByIdRef = useRef<Map<string, EditorAnnotation>>(new Map());
    sousByIdRef.current = new Map(sousAnnotations.map((a) => [a.id, a]));

    // The hover zip. A content finding's highlight carries `data-annotation-id`
    // → return just that finding. Otherwise it's a token hitpoint: onion lint by
    // touched token-id, sid as the fallback (the pre-zip behavior).
    const lookupAnnotationsForTarget = useCallback(
        (target: HTMLElement): EditorAnnotation[] => {
            const annotationId = target.getAttribute("data-annotation-id");
            if (annotationId) {
                const found = sousByIdRef.current.get(annotationId);
                return found ? [found] : [];
            }
            const dataId = target.getAttribute("data-id");
            const dataSid = target.getAttribute("data-sid");
            const out: EditorAnnotation[] = [];
            if (dataId) {
                for (const annotation of lintAnnotationsRef.current) {
                    if (annotation.touchedTokenIds?.includes(dataId)) {
                        out.push(annotation);
                    }
                }
                if (out.length > 0) return out;
            }
            if (dataSid) {
                for (const annotation of lintAnnotationsRef.current) {
                    if (
                        annotation.anchor.kind === "token" &&
                        annotation.anchor.sid === dataSid
                    ) {
                        out.push(annotation);
                    }
                }
            }
            return out;
        },
        [],
    );

    // Content highlights are click-through, so hover is found geometrically:
    // hit-test the cursor against the rendered content-finding rects (their
    // live `getBoundingClientRect`, so scroll stays correct). Few per chapter.
    const findContentHit = useCallback(
        (clientX: number, clientY: number): HTMLElement | null => {
            const root = rootElRef.current;
            if (!root) return null;
            const candidates = root.querySelectorAll<HTMLElement>(
                "[data-content-finding]",
            );
            for (const el of candidates) {
                const r = el.getBoundingClientRect();
                if (
                    clientX >= r.left &&
                    clientX <= r.right &&
                    clientY >= r.top &&
                    clientY <= r.bottom
                ) {
                    return el;
                }
            }
            return null;
        },
        [],
    );

    const {
        hoveredAnnotations,
        hoveredAnchorEl,
        onTooltipMouseEnter,
        onTooltipMouseLeave,
    } = useEditorLintTooltip(lookupAnnotationsForTarget, findContentHit);

    useEffect(() => {
        const editorRoot = editor.getRootElement();
        const nextRoot =
            (editorRoot?.closest(
                `[data-testid="${TESTING_IDS.mainEditorContainer}"]`,
            ) as HTMLElement | null) ??
            (editorRoot?.closest(
                `[data-js="${DATA_JS.editorContainer}"]`,
            ) as HTMLElement | null) ??
            null;
        setRootEl(nextRoot);
    }, [editor]);

    // Install resolveAnchors against the current root. Teardown clears
    // overlay state only when the root changes (project switch / unmount),
    // not on every tick.
    useLayoutEffect(() => {
        if (!rootEl) {
            resolveAnchorsRef.current = null;
            return;
        }

        const resolveAnchors = () => {
            // Form mode renders verses inside decorator-node cards on the
            // right; the underlying USFMTextNode DOM may be off-screen or
            // unrendered, so anchor resolution produces stale or
            // 0,0-clamped rects. Hide the overlay entirely in form mode —
            // form mode has its own per-card lint affordance.
            if (editorModeRef.current === EDITOR_MODES.form) {
                if (hitpointsRef.current.size > 0) {
                    syncHitpointAttributes(hitpointsRef.current, new Set());
                    hitpointsRef.current = new Set();
                }
                setEntries((prev) => (prev.length === 0 ? prev : []));
                return;
            }

            const lookup = buildDomLookup(rootEl);

            for (const record of recordsRef.current.values()) {
                // Preferred path: the flagged token is visible text → highlight
                // it. Prose (text tokens) highlights per line; numbers/markers
                // use one bounding box. An empty/hidden element (e.g. a \m
                // empty-paragraph marker in regular mode) yields no usable
                // rects, so we let it fall through to the badge.
                const direct = findDirectTokenElement(lookup, record.issue);
                const perLine =
                    direct?.getAttribute("data-token-type") === "text";
                const rects = direct
                    ? measureHighlightRects(rootEl, direct, perLine)
                    : [];
                if (direct && rects.length > 0) {
                    record.element = direct;
                    record.kind = "highlight";
                    record.rects = rects;
                    record.left = 0;
                    record.top = 0;
                    record.stale = false;
                    continue;
                }

                // Fallback path: token isn't rendered as usable text (hidden or
                // empty marker) → badge at the next-best visible anchor.
                const fallback = findBestVisibleTarget(
                    lookup,
                    record.issue,
                    editorModeRef.current,
                );
                const rect = fallback
                    ? measureAnchorRect(rootEl, fallback)
                    : null;
                if (fallback && rect) {
                    record.element = fallback;
                    record.kind = "badge";
                    record.rects = [];
                    record.left = Math.max(rect.left - 18, 0);
                    record.top = Math.max(
                        rect.top + Math.min(rect.height / 2 - 8, 4),
                        0,
                    );
                    record.stale = false;
                } else {
                    record.element = null;
                    record.kind = "none";
                    record.rects = [];
                    record.stale = true;
                }
            }

            // sous content findings: resolve each `(sid, range)` to its precise
            // rects. The rect itself is the hover target (it carries
            // `data-annotation-id`), so several findings sharing one rendered
            // token each hover independently — keyed to the range, not the
            // token. No token hitpoint tagging here (cf. lint's click-through
            // highlight, which hovers off the underlying token).
            const sousEntries: OverlayEntry[] = [];
            const segments = sousSegmentsRef.current;
            for (const annotation of sousAnnotationsRef.current) {
                if (annotation.anchor.kind !== "content") continue;
                const resolved = resolveContentRange(
                    annotation.anchor.sid,
                    annotation.anchor.range,
                    segments,
                    rootEl,
                );
                if (resolved.rects.length === 0) continue;
                sousEntries.push({
                    kind: "highlight",
                    key: annotation.id,
                    dataId: null,
                    dataSid: null,
                    rects: resolved.rects,
                    annotationId: annotation.id,
                });
            }

            publishEntries(
                recordsRef.current,
                setEntries,
                hitpointsRef,
                sousEntries,
            );
        };

        resolveAnchorsRef.current = resolveAnchors;
        resolveAnchors();

        return () => {
            resolveAnchorsRef.current = null;
            syncHitpointAttributes(hitpointsRef.current, new Set());
            hitpointsRef.current = new Set();
            recordsRef.current = new Map();
            setEntries([]);
        };
    }, [rootEl]);

    // Tick-driven remeasure: commit-settle pulses, window resize, and
    // scroll bumps all flow through `useLayoutTick`. No MutationObserver —
    // editor DOM changes ride the bridge → commit → overlay-tick pipeline.
    // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the trigger; body reads via ref.
    useLayoutEffect(() => {
        resolveAnchorsRef.current?.();
    }, [tick]);

    useEffect(() => {
        const nextRecords = new Map<string, AnchorRecord>();
        for (const issue of lint.filteredVisibleIssues) {
            const issueKey = getLintIssueKey(issue);
            const previous = recordsRef.current.get(issueKey);
            nextRecords.set(issueKey, {
                issueKey,
                anchorKey: getAnchorKey(issue),
                issue,
                element: previous?.element ?? null,
                kind: previous?.kind ?? "none",
                rects: previous?.rects ?? [],
                left: previous?.left ?? 0,
                top: previous?.top ?? 0,
                stale: previous?.stale ?? false,
            });
        }

        recordsRef.current = nextRecords;
        resolveAnchorsRef.current?.();
    }, [lint.filteredVisibleIssues]);

    // sous findings arrive on the store's own (calmer) clock, outside the
    // layout-tick pulse — re-resolve so their highlights + hitpoints redraw.
    // biome-ignore lint/correctness/useExhaustiveDependencies: the ref body reads sousAnnotationsRef; sousAnnotations is the trigger.
    useEffect(() => {
        resolveAnchorsRef.current?.();
    }, [sousAnnotations]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: <We intentionally want this to run when editorMode changes>
    useEffect(() => {
        for (const record of recordsRef.current.values()) {
            record.element = null;
            record.kind = "none";
            record.rects = [];
            record.stale = true;
        }
        resolveAnchorsRef.current?.();
    }, [editorMode]);

    // Belt-and-suspenders: resolveAnchors clears entries on form-mode entry,
    // but a transition can leave a frame of stale entries painted. Skip
    // rendering entirely in form mode.
    const shouldRender =
        rootEl !== null &&
        entries.length > 0 &&
        editorMode !== EDITOR_MODES.form;
    const rendered = useMemo(() => {
        if (!shouldRender) return null;
        return (
            <div className={styles.host} aria-hidden="true">
                {entries.map((entry) =>
                    entry.kind === "highlight" ? (
                        // Lint highlights are click-through (the underlying token
                        // is the hover target). Content (sous) highlights ARE the
                        // hover target — keyed to the finding via
                        // `data-annotation-id`, so multiple findings on one token
                        // hover independently.
                        entry.rects.map((rect, i) => (
                            <span
                                key={`${entry.key}:${i}`}
                                className={
                                    entry.annotationId
                                        ? styles.contentHighlight
                                        : styles.highlight
                                }
                                // Content highlights are click-through; the hover
                                // is found geometrically by `data-content-finding`
                                // rect, keyed to the finding by data-annotation-id.
                                data-content-finding={
                                    entry.annotationId ? "true" : undefined
                                }
                                data-annotation-id={
                                    entry.annotationId ?? undefined
                                }
                                style={{
                                    left: `${rect.left}px`,
                                    top: `${rect.top}px`,
                                    width: `${rect.width}px`,
                                    height: `${rect.height}px`,
                                }}
                            />
                        ))
                    ) : (
                        <span
                            key={entry.key}
                            className={styles.item}
                            data-js={DATA_JS.lintDomOverlayHitpoint}
                            data-id={entry.dataId ?? undefined}
                            data-sid={entry.dataSid ?? undefined}
                            style={{
                                left: `${entry.left}px`,
                                top: `${entry.top}px`,
                            }}
                        />
                    ),
                )}
            </div>
        );
    }, [entries, shouldRender]);

    const popover = (
        <AnnotationPopover
            anchor={hoveredAnchorEl}
            annotations={hoveredAnnotations}
            onMouseEnter={onTooltipMouseEnter}
            onMouseLeave={onTooltipMouseLeave}
            side="top"
            popupDataJs={DATA_JS.lintTooltipOverlay}
        />
    );

    const chapterLabelPicker = (
        <ChapterLabelPicker
            isOpen={chapterLabelTally !== null}
            tally={chapterLabelTally}
            onClose={() => setChapterLabelTally(null)}
            onConfirm={(targetStem) => {
                // Fabricate the per-book stem swap (preserving each chapter's
                // number), commit across books via a workspace-scope
                // `withWorkingFilesDraft`, then relint the affected books.
                actions.standardizeChapterLabels(targetStem);
                setChapterLabelTally(null);
            }}
        />
    );

    if (!rootEl || !rendered) {
        return (
            <>
                {popover}
                {chapterLabelPicker}
            </>
        );
    }
    return (
        <>
            {createPortal(rendered, rootEl)}
            {popover}
            {chapterLabelPicker}
        </>
    );
}
