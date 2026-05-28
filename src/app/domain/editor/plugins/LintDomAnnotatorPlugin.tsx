/**
 * Snapshot-driven lint overlay.
 *
 * This plugin no longer decides which issues exist. It only takes the already-
 * committed visible lint snapshot, finds the best DOM anchor for each issue,
 * and keeps those badges positioned while the document scrolls or reflows.
 */
import type { LexicalEditor } from "lexical";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import { useEditorLintTooltip } from "@/app/domain/editor/hooks/useEditorLintTooltip.ts";
import { getLintIssueKey } from "@/app/ui/hooks/lintState.ts";
import { useLayoutTick } from "@/app/ui/hooks/useLayoutTick.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import {
    formatLintIssueMessage,
    formatTokenFixLabel,
} from "@/app/ui/i18n/usfmOnionLocalization.ts";
import * as styles from "@/app/ui/styles/modules/LintDomOverlay.css.ts";
import * as tooltipStyles from "@/app/ui/styles/modules/LintTooltipOverlay.css.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

type OverlayEntry = {
    key: string;
    dataId: string | null;
    dataSid: string | null;
    left: number;
    top: number;
};

type AnchorRecord = {
    issueKey: string;
    anchorKey: string;
    issue: LintIssue;
    element: HTMLElement | null;
    rect: DOMRect | null;
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
) {
    const entries: OverlayEntry[] = [];
    const nextHitpoints = new Set<HTMLElement>();

    for (const record of records.values()) {
        if (record.element && record.rect && !record.stale) {
            nextHitpoints.add(record.element);
        }
        if (!record.rect) continue;
        entries.push({
            key: record.issueKey,
            dataId:
                record.element?.getAttribute("data-id") ??
                record.issue.tokenId ??
                null,
            dataSid:
                record.element?.getAttribute("data-sid") ??
                record.issue.sid ??
                null,
            left: Math.max(record.rect.left - 18, 0),
            top: Math.max(
                record.rect.top + Math.min(record.rect.height / 2 - 8, 4),
                0,
            ),
        });
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
    const { actions, lint, project, layoutTickStore } = useWorkspaceContext();
    const editorMode = project.appSettings.editorMode;
    const tick = useLayoutTick(layoutTickStore);
    const [rootEl, setRootEl] = useState<HTMLElement | null>(null);
    const [entries, setEntries] = useState<OverlayEntry[]>([]);
    const editorModeRef = useRef(editorMode);
    editorModeRef.current = editorMode;
    const recordsRef = useRef<Map<string, AnchorRecord>>(new Map());
    const hitpointsRef = useRef<Set<HTMLElement>>(new Set());
    const resolveAnchorsRef = useRef<(() => void) | null>(null);
    const {
        hoveredErrors,
        tooltipPosition,
        onTooltipMouseEnter,
        onTooltipMouseLeave,
    } = useEditorLintTooltip(lint.filteredVisibleIssues);

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
            // 0,0-clamped rects and badges pile up at the left edge. Hide
            // the overlay entirely in form mode — form mode has its own
            // per-card lint affordance.
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
                const hasConnectedElement = Boolean(
                    record.element?.isConnected,
                );
                const isRawMode =
                    editorModeRef.current === EDITOR_MODES.usfm ||
                    editorModeRef.current === EDITOR_MODES.plain;
                const cachedIsWrongType =
                    hasConnectedElement &&
                    record.element?.getAttribute("data-token-type") ===
                        "numberRange" &&
                    isRawMode;
                const element =
                    hasConnectedElement &&
                    record.element &&
                    isRenderedElement(record.element) &&
                    !cachedIsWrongType
                        ? record.element
                        : findBestVisibleTarget(
                              lookup,
                              record.issue,
                              editorModeRef.current,
                          );

                if (!element) {
                    record.element = null;
                    record.stale = true;
                    continue;
                }

                record.element = element;
                record.rect = measureAnchorRect(rootEl, element) ?? record.rect;
                record.stale = false;
            }

            publishEntries(recordsRef.current, setEntries, hitpointsRef);
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
                rect: previous?.rect ?? null,
                stale: previous?.stale ?? false,
            });
        }

        recordsRef.current = nextRecords;
        resolveAnchorsRef.current?.();
    }, [lint.filteredVisibleIssues]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: <We intentionally want this to run when editorMode changes>
    useEffect(() => {
        for (const record of recordsRef.current.values()) {
            record.element = null;
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
                {entries.map((entry) => (
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
                ))}
            </div>
        );
    }, [entries, shouldRender]);

    const tooltip =
        hoveredErrors && tooltipPosition
            ? createPortal(
                  <div
                      className={tooltipStyles.host}
                      data-js={DATA_JS.lintTooltipOverlay}
                      style={{
                          top: tooltipPosition.y,
                          left: tooltipPosition.x,
                      }}
                  >
                      {/** biome-ignore lint/a11y/noStaticElementInteractions: tooltip card holds hover state */}
                      <div
                          className={tooltipStyles.card}
                          onMouseEnter={onTooltipMouseEnter}
                          onMouseLeave={onTooltipMouseLeave}
                      >
                          {hoveredErrors.map((error) => (
                              <div
                                  key={`${error.tokenId ?? error.relatedTokenId}:${error.code}:${error.sid}`}
                                  className={tooltipStyles.row}
                              >
                                  <span className={tooltipStyles.message}>
                                      {formatLintIssueMessage(error)}
                                  </span>
                                  {error.fix ? (
                                      <button
                                          type="button"
                                          className={tooltipStyles.fixButton}
                                          onClick={() =>
                                              actions.fixLintError(error)
                                          }
                                      >
                                          {formatTokenFixLabel(error.fix)}
                                      </button>
                                  ) : null}
                              </div>
                          ))}
                      </div>
                  </div>,
                  document.body,
              )
            : null;

    if (!rootEl || !rendered) return tooltip;
    return (
        <>
            {createPortal(rendered, rootEl)}
            {tooltip}
        </>
    );
}
