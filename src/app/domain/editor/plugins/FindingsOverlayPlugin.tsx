/**
 * Findings overlay (snapshot-driven).
 *
 * This plugin does not decide which findings exist or which are shown — the
 * pipelines write the FindingsStore and `useFindings` applies the
 * presentation policy; this plugin takes the policy-shown set for the
 * visible chapter, finds the best DOM presentation for each finding, and
 * keeps those affordances positioned while the document scrolls or reflows.
 *
 * Reconciliation is KEYED by `Finding.id` (deterministic across passes):
 * a findings commit diffs key sets — removed keys tear down, new keys
 * resolve + draw, surviving keys keep their rects untouched. Only a layout
 * tick (commit-settle pulse, resize, scroll, content swap) re-measures
 * everything: layout is the wholesale invalidator, findings changes are the
 * incremental one. Editing one thing repaints one finding.
 *
 * Two affordances for token-anchored findings, chosen by whether the flagged
 * token is currently rendered as visible text:
 *  - HIGHLIGHT — the token's own element is on screen; translucent boxes over
 *    its client rects (multi-line aware).
 *  - BADGE — it isn't (e.g. a USFM marker hidden in regular/view mode); the
 *    `!` badge at the next-best visible anchor. A DOM capability fact, not a
 *    policy row.
 * Content-anchored findings (sous) resolve to precise sub-token rects via
 * `resolveContentRange` against the segment sidecar.
 *
 * All affordances open the same decorated-finding popover on hover.
 */
import type { LexicalEditor } from "lexical";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import type {
    DecoratedFinding,
    Finding,
} from "@/app/domain/editor/annotations/finding.ts";
import { resolveContentRange } from "@/app/domain/editor/annotations/resolveContentRange.ts";
import { useEditorFindingsTooltip } from "@/app/domain/editor/hooks/useEditorFindingsTooltip.ts";
import { AnnotationPopover } from "@/app/ui/components/blocks/AnnotationPopover.tsx";
import { useDecorateFindings } from "@/app/ui/hooks/useDecorateFindings.ts";
import { useLayoutTick } from "@/app/ui/hooks/useLayoutTick.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/FindingsOverlay.css.ts";

type Rect = { left: number; top: number; width: number; height: number };

type HighlightEntry = {
    kind: "highlight";
    key: string;
    dataId: string | null;
    dataSid: string | null;
    rects: Rect[];
    // Set for content findings: the rect itself is the hover target (it
    // carries `data-annotation-id`), keyed to this finding's exact range
    // rather than the shared underlying token.
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

/** Per-token-finding resolution state, keyed by `Finding.id` in `recordsRef`. */
type AnchorRecord = {
    finding: Finding;
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

/** Token-ids (then sid) a finding's affordance can anchor to, best first. */
function anchorCandidates(finding: Finding): string[] {
    const candidates: string[] = [...(finding.touchedTokenIds ?? [])];
    const sid = finding.anchor.sid;
    if (sid) candidates.push(sid);
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
    finding: Finding,
): HTMLElement | null {
    for (const id of finding.touchedTokenIds ?? []) {
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
    finding: Finding,
    editorMode: string,
): HTMLElement | null {
    const isRawMode =
        editorMode === EDITOR_MODES.usfm || editorMode === EDITOR_MODES.plain;

    for (const candidate of anchorCandidates(finding)) {
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

/** Resolve one token-anchored record against the current DOM lookup. */
function resolveRecord(
    record: AnchorRecord,
    lookup: DomLookup,
    rootEl: HTMLElement,
    editorMode: string,
): void {
    // Preferred path: the flagged token is visible text → highlight it.
    // Prose (text tokens) highlights per line; numbers/markers use one
    // bounding box. An empty/hidden element (e.g. a \m empty-paragraph marker
    // in regular mode) yields no usable rects, so it falls through to the
    // badge.
    const direct = findDirectTokenElement(lookup, record.finding);
    const perLine = direct?.getAttribute("data-token-type") === "text";
    const rects = direct ? measureHighlightRects(rootEl, direct, perLine) : [];
    if (direct && rects.length > 0) {
        record.element = direct;
        record.kind = "highlight";
        record.rects = rects;
        record.left = 0;
        record.top = 0;
        record.stale = false;
        return;
    }

    // Fallback path: token isn't rendered as usable text (hidden or empty
    // marker) → badge at the next-best visible anchor.
    const fallback = findBestVisibleTarget(lookup, record.finding, editorMode);
    const rect = fallback ? measureAnchorRect(rootEl, fallback) : null;
    if (fallback && rect) {
        record.element = fallback;
        record.kind = "badge";
        record.rects = [];
        record.left = Math.max(rect.left - 18, 0);
        record.top = Math.max(rect.top + Math.min(rect.height / 2 - 8, 4), 0);
        record.stale = false;
    } else {
        record.element = null;
        record.kind = "none";
        record.rects = [];
        record.stale = true;
    }
}

function publishEntries(
    records: Map<string, AnchorRecord>,
    setEntries: (entries: OverlayEntry[]) => void,
    activeHitpointsRef: { current: Set<HTMLElement> },
    // Content findings resolve to their own highlight entries; merged with
    // the token-anchored set.
    extraEntries: OverlayEntry[] = [],
) {
    const entries: OverlayEntry[] = [...extraEntries];
    const nextHitpoints = new Set<HTMLElement>();

    for (const [id, record] of records) {
        if (record.stale || !record.element || record.kind === "none") continue;

        const anchor = record.finding.anchor;
        const dataId =
            record.element.getAttribute("data-id") ??
            (anchor.kind === "token" ? anchor.tokenId : null);
        const dataSid =
            record.element.getAttribute("data-sid") ?? anchor.sid ?? null;

        if (record.kind === "highlight" && record.rects.length > 0) {
            // The highlight box is click-through, so the underlying token is
            // the hover target — mark it with data-lint-hitpoint.
            nextHitpoints.add(record.element);
            entries.push({
                kind: "highlight",
                key: id,
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
                key: id,
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

type FindingsOverlayPluginProps = {
    editor: LexicalEditor;
};

export function FindingsOverlayPlugin({ editor }: FindingsOverlayPluginProps) {
    const { findings, project, layoutTickStore } = useWorkspaceContext();
    const editorMode = project.appSettings.editorMode;
    const tick = useLayoutTick(layoutTickStore);
    const [rootEl, setRootEl] = useState<HTMLElement | null>(null);
    const rootElRef = useRef<HTMLElement | null>(null);
    rootElRef.current = rootEl;
    const [entries, setEntries] = useState<OverlayEntry[]>([]);
    const editorModeRef = useRef(editorMode);
    editorModeRef.current = editorMode;
    // Token-anchored resolution state, keyed by Finding.id — the keyed
    // reconciliation map. A plain Map (string keys; must be iterable to
    // diff); torn down explicitly with the root / on findings changes.
    const recordsRef = useRef<Map<string, AnchorRecord>>(new Map());
    const hitpointsRef = useRef<Set<HTMLElement>>(new Set());
    const resolveAllRef = useRef<(() => void) | null>(null);

    // The policy-shown set for the visible chapter, decorated at this edge.
    // Token-anchored findings go through the record map; content-anchored
    // ones resolve to sub-token rects against the segment sidecar.
    const decorate = useDecorateFindings();
    const decorated = useMemo(
        () => findings.overlayFindings.map(decorate),
        [findings.overlayFindings, decorate],
    );
    const tokenFindings = useMemo(
        () => decorated.filter((d) => d.finding.anchor.kind === "token"),
        [decorated],
    );
    const contentFindings = useMemo(
        () => decorated.filter((d) => d.finding.anchor.kind === "content"),
        [decorated],
    );
    const tokenFindingsRef = useRef(tokenFindings);
    tokenFindingsRef.current = tokenFindings;
    const contentFindingsRef = useRef(contentFindings);
    contentFindingsRef.current = contentFindings;
    const segmentsRef = useRef(findings.sousSegments);
    segmentsRef.current = findings.sousSegments;
    // finding-id -> decorated, for the hover lookup. Content findings hover
    // off their own highlight rect (which carries `data-annotation-id`), so
    // the lookup keys by finding id — not the shared token — keeping multiple
    // findings in one token independently hoverable.
    const contentByIdRef = useRef<Map<string, DecoratedFinding>>(new Map());
    contentByIdRef.current = new Map(contentFindings.map((d) => [d.id, d]));

    // The hover zip. A content finding's highlight carries
    // `data-annotation-id` → return just that finding. Otherwise it's a token
    // hitpoint: token-anchored findings by touched token-id, sid as the
    // fallback (the pre-zip behavior).
    const lookupAnnotationsForTarget = useCallback(
        (target: HTMLElement): DecoratedFinding[] => {
            const annotationId = target.getAttribute("data-annotation-id");
            if (annotationId) {
                const found = contentByIdRef.current.get(annotationId);
                return found ? [found] : [];
            }
            const dataId = target.getAttribute("data-id");
            const dataSid = target.getAttribute("data-sid");
            const out: DecoratedFinding[] = [];
            if (dataId) {
                for (const annotation of tokenFindingsRef.current) {
                    if (annotation.finding.touchedTokenIds?.includes(dataId)) {
                        out.push(annotation);
                    }
                }
                if (out.length > 0) return out;
            }
            if (dataSid) {
                for (const annotation of tokenFindingsRef.current) {
                    if (
                        annotation.finding.anchor.kind === "token" &&
                        annotation.finding.anchor.sid === dataSid
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
    } = useEditorFindingsTooltip(lookupAnnotationsForTarget, findContentHit);

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

    // Content findings: resolve each `(sid, range)` to its precise rects.
    // The rect itself is the hover target (it carries `data-annotation-id`),
    // so several findings sharing one rendered token each hover
    // independently — keyed to the range, not the token. Cheap (few per
    // chapter), so re-resolved whole on every publish.
    const resolveContentEntries = useCallback((): OverlayEntry[] => {
        const root = rootElRef.current;
        if (!root) return [];
        const out: OverlayEntry[] = [];
        const segments = segmentsRef.current;
        for (const annotation of contentFindingsRef.current) {
            const anchor = annotation.finding.anchor;
            if (anchor.kind !== "content") continue;
            const resolved = resolveContentRange(
                anchor.sid,
                anchor.range,
                segments,
                root,
            );
            if (resolved.rects.length === 0) continue;
            out.push({
                kind: "highlight",
                key: annotation.id,
                dataId: null,
                dataSid: null,
                rects: resolved.rects,
                annotationId: annotation.id,
            });
        }
        return out;
    }, []);

    // Install the wholesale resolver against the current root. Teardown
    // clears overlay state only when the root changes (project switch /
    // unmount), not on every tick.
    // biome-ignore lint/correctness/useExhaustiveDependencies: resolveContentEntries is a stable useCallback([]) binding.
    useLayoutEffect(() => {
        if (!rootEl) {
            resolveAllRef.current = null;
            return;
        }

        // Resolve EVERYTHING against a fresh DOM lookup — the layout-tick
        // path (commit settle, resize, scroll, content swap, mode change).
        // Re-measuring from a fresh lookup is also what releases references
        // to detached DOM after a content swap.
        const resolveAll = () => {
            // Defensive: the policy hides everything in form shape, so the
            // shown set is already empty — but a transition can race a frame.
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
                resolveRecord(record, lookup, rootEl, editorModeRef.current);
            }
            publishEntries(
                recordsRef.current,
                setEntries,
                hitpointsRef,
                resolveContentEntries(),
            );
        };

        resolveAllRef.current = resolveAll;
        resolveAll();

        return () => {
            resolveAllRef.current = null;
            syncHitpointAttributes(hitpointsRef.current, new Set());
            hitpointsRef.current = new Set();
            recordsRef.current = new Map();
            setEntries([]);
        };
    }, [rootEl]);

    // Tick-driven remeasure: commit-settle pulses, window resize, scroll, and
    // post-content-swap pulses all flow through `useLayoutTick`. No
    // MutationObserver — editor DOM changes ride the bridge → commit →
    // overlay-tick pipeline.
    // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the trigger; body reads via ref.
    useLayoutEffect(() => {
        resolveAllRef.current?.();
    }, [tick]);

    // Findings-change reconciliation: diff the keyed record map against the
    // shown set. Removed keys tear down; NEW keys resolve against one fresh
    // lookup; surviving keys keep their rects (no DOM work) until the next
    // layout tick. This is the O(changed) path — WE4 in the findings plan.
    //
    // Content findings are key-diffed too (by id set + segments identity):
    // their store commit arrives AFTER the edit's layout tick (the sous
    // debounce), so this effect is the ONLY repaint that clears a removed
    // content highlight — including the remove-to-zero case. Decorated array
    // identities churn with provider renders, so the diff is by value, never
    // by array identity.
    const prevContentKeyRef = useRef<string>("");
    const prevSegmentsRef = useRef<unknown>(null);
    useEffect(() => {
        const records = recordsRef.current;
        const nextIds = new Set(tokenFindings.map((d) => d.id));

        let changed = false;
        for (const id of [...records.keys()]) {
            if (!nextIds.has(id)) {
                records.delete(id);
                changed = true;
            }
        }

        const added: AnchorRecord[] = [];
        for (const decoratedFinding of tokenFindings) {
            if (records.has(decoratedFinding.id)) continue;
            const record: AnchorRecord = {
                finding: decoratedFinding.finding,
                element: null,
                kind: "none",
                rects: [],
                left: 0,
                top: 0,
                stale: false,
            };
            records.set(decoratedFinding.id, record);
            added.push(record);
            changed = true;
        }

        const root = rootElRef.current;
        if (added.length > 0 && root) {
            const lookup = buildDomLookup(root);
            for (const record of added) {
                resolveRecord(record, lookup, root, editorModeRef.current);
            }
        }

        const contentKey = contentFindings.map((d) => d.id).join("|");
        const contentChanged =
            contentKey !== prevContentKeyRef.current ||
            findings.sousSegments !== prevSegmentsRef.current;
        prevContentKeyRef.current = contentKey;
        prevSegmentsRef.current = findings.sousSegments;

        if (changed || contentChanged) {
            publishEntries(
                records,
                setEntries,
                hitpointsRef,
                resolveContentEntries(),
            );
        }
    }, [
        tokenFindings,
        contentFindings,
        findings.sousSegments,
        resolveContentEntries,
    ]);

    // Mode switch changes what's rendered wholesale — stale everything and
    // re-resolve (the policy may also have emptied the shown set).
    // biome-ignore lint/correctness/useExhaustiveDependencies: <We intentionally want this to run when editorMode changes>
    useEffect(() => {
        for (const record of recordsRef.current.values()) {
            record.element = null;
            record.kind = "none";
            record.rects = [];
            record.stale = true;
        }
        resolveAllRef.current?.();
    }, [editorMode]);

    // Belt-and-suspenders: the policy empties the shown set in form mode and
    // resolveAll clears on entry, but a transition can leave a frame of stale
    // entries painted. Skip rendering entirely in form mode.
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
                        // Token highlights are click-through (the underlying
                        // token is the hover target). Content highlights ARE
                        // the hover target — keyed to the finding via
                        // `data-annotation-id`, so multiple findings on one
                        // token hover independently.
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

    if (!rootEl || !rendered) {
        return popover;
    }
    return (
        <>
            {createPortal(rendered, rootEl)}
            {popover}
        </>
    );
}
