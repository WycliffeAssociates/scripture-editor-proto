import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
import {
  locateUtf16Offset,
  tokenElement,
} from "@/app/domain/editor/annotations/resolveContentRange.ts";
import { AnnotationPopover } from "@/app/ui/components/blocks/AnnotationPopover.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import type { SearchMatch } from "@/app/ui/hooks/search/searchTypes.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/SearchReplaceSuggestOverlay.css.ts";

type SearchSuggestion = SearchMatch & {
  key: string;
  labelText: string;
};

type PositionedSuggestion = SearchSuggestion & {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Matches are keyed by verse + occurrence + first token so the overlay can
 * survive editor rerenders without inventing a second identity model.
 */
function suggestionKey(match: SearchMatch) {
  return `${match.sid}:${match.sidOccurrenceIndex}:${match.ranges[0]?.tokenId ?? ""}`;
}

/**
 * The match's bounding client rect, resolved via `data-id` on the rendered
 * tokens (the findings resolution path). Unions the per-token paint ranges so a
 * multi-token USFM-mode match gets one underline spanning them. Null when none
 * of the tokens are currently rendered.
 */
function matchClientRect(
  root: HTMLElement,
  match: SearchMatch,
): DOMRect | null {
  let union: DOMRect | null = null;
  for (const paintRange of match.ranges) {
    const el = tokenElement(root, paintRange.tokenId);
    if (!el) continue;
    const start = locateUtf16Offset(el, paintRange.start);
    const end = locateUtf16Offset(el, paintRange.end);
    if (!start || !end) continue;
    const domRange = el.ownerDocument.createRange();
    domRange.setStart(start.node, start.offset);
    domRange.setEnd(end.node, end.offset);
    const rect = domRange.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    union = union ? unionRect(union, rect) : rect;
  }
  return union;
}

function unionRect(a: DOMRect, b: DOMRect): DOMRect {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(a.right, b.right);
  const bottom = Math.max(a.bottom, b.bottom);
  return new DOMRect(left, top, right - left, bottom - top);
}

/**
 * Shows the inline "replace this match" affordance over currently highlighted
 * search results when the search pane is in replace mode.
 */
export function SearchReplaceSuggestPlugin() {
  const [editor] = useLexicalComposerContext();
  const { search } = useWorkspaceContext();
  const { currentMatches, isSearchPaneOpen, replaceMatch, replaceTerm } =
    search;
  const [positioned, setPositioned] = useState<PositionedSuggestion[]>([]);
  const [overlayHostEl, setOverlayHostEl] = useState<HTMLElement | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const isEnabled =
    isSearchPaneOpen &&
    search.searchTerm.trim().length > 0 &&
    // Whitespace-only replacements are legitimate edits, so gate on presence
    // of any replacement bytes, not trimmed content.
    replaceTerm.length > 0 &&
    currentMatches.length > 0;

  const getContainerEl = useCallback((): HTMLElement | null => {
    const root = editor.getRootElement();
    if (!root) return null;
    return root.closest<HTMLElement>(`[data-js="${DATA_JS.editorContainer}"]`);
  }, [editor]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(
    (key: string) => {
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setActiveKey((current) => (current === key ? null : current));
      }, 3000);
    },
    [clearCloseTimer],
  );

  const recomputePositions = useCallback(() => {
    if (!isEnabled) {
      setPositioned([]);
      return;
    }

    const container = containerRef.current ?? getContainerEl();
    if (!container) return;
    containerRef.current = container;
    const containerRect = container.getBoundingClientRect();

    const root = editor.getRootElement();
    if (!root) return;

    const next: PositionedSuggestion[] = [];
    for (const match of currentMatches) {
      // Gap matches (regular-mode hidden markup) are find-only — the panel row
      // offers the USFM-mode toggle, not an inline replace.
      if (match.source !== "target" || match.hasGap) continue;
      if (!match.matchedText) continue;

      const rect = matchClientRect(root, match);
      if (!rect) continue;

      next.push({
        ...match,
        key: suggestionKey(match),
        labelText: match.matchedText,
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
      });
    }

    setPositioned(next);
  }, [currentMatches, editor, getContainerEl, isEnabled]);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      recomputePositions();
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [recomputePositions]);

  // Edits move, split, or remove the matched nodes — reposition on every editor
  // update (overlays for nodes that no longer exist are dropped by the lookup in
  // recomputePositions). The match SET itself is refreshed upstream by the
  // search rerun pipeline; this keeps the overlay aligned between reruns.
  useEffect(() => {
    return editor.registerUpdateListener(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => recomputePositions());
    });
  }, [editor, recomputePositions]);

  useEffect(() => {
    const container = getContainerEl();
    if (!container) return;
    if (overlayHostEl) return;
    const host = document.createElement("div");
    host.dataset.js = DATA_JS.searchReplaceSuggestOverlay;
    host.className = styles.overlayHost;
    container.appendChild(host);
    setOverlayHostEl(host);
  }, [getContainerEl, overlayHostEl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handle = () => recomputePositions();
    container.addEventListener("scroll", handle, { passive: true });
    window.addEventListener("resize", handle);
    return () => {
      container.removeEventListener("scroll", handle);
      window.removeEventListener("resize", handle);
    };
  }, [recomputePositions]);

  useEffect(() => {
    if (isEnabled) return;
    setActiveKey(null);
    clearCloseTimer();
  }, [clearCloseTimer, isEnabled]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
      if (!overlayHostEl) return;
      overlayHostEl.remove();
    };
  }, [clearCloseTimer, overlayHostEl]);

  const rendered = useMemo(() => {
    return positioned.map((item) => (
      <SearchReplaceSuggestItem
        key={item.key}
        item={item}
        replaceTerm={replaceTerm}
        // Keep the popover inside the editor pane so it can't spill off a
        // narrow docked column (mirrors the findings overlay).
        collisionBoundary={containerRef.current}
        isActive={activeKey === item.key}
        onActivate={() => {
          clearCloseTimer();
          setActiveKey(item.key);
        }}
        onToggle={() => {
          clearCloseTimer();
          setActiveKey((key) => (key === item.key ? null : item.key));
        }}
        onKeepOpen={clearCloseTimer}
        onScheduleClose={() => scheduleClose(item.key)}
        onApply={() => void replaceMatch(item)}
      />
    ));
  }, [
    activeKey,
    clearCloseTimer,
    positioned,
    replaceMatch,
    replaceTerm,
    scheduleClose,
  ]);

  if (!overlayHostEl || !isEnabled) return null;
  return createPortal(rendered, overlayHostEl);
}

/**
 * One inline replace suggestion: a dotted underline over the match that, when
 * active, opens the shared annotation popover (so placement and styling match
 * the rest of the editor's affordances — findings, verse-marker suggest) with
 * the replace prompt + a confirm action. Reuses the popover UI, not the
 * findings store.
 */
function SearchReplaceSuggestItem(props: {
  item: PositionedSuggestion;
  replaceTerm: string;
  collisionBoundary: Element | null;
  isActive: boolean;
  onActivate: () => void;
  onToggle: () => void;
  onKeepOpen: () => void;
  onScheduleClose: () => void;
  onApply: () => void;
}) {
  const { item } = props;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <div className={styles.suggestion} style={{ left: item.x, top: item.y }}>
      <button
        type="button"
        ref={setAnchorEl}
        className={styles.underline}
        style={{ width: item.width, height: item.height }}
        data-testid={TESTING_IDS.searchInlineReplaceTrigger}
        aria-label={`Open replace suggestion for ${item.labelText}`}
        aria-expanded={props.isActive}
        onMouseEnter={props.onActivate}
        onMouseLeave={props.onScheduleClose}
        onClick={props.onToggle}
      />
      <AnnotationPopover
        anchor={anchorEl}
        open={props.isActive}
        side="top"
        collisionBoundary={props.collisionBoundary}
        onMouseEnter={props.onKeepOpen}
        onMouseLeave={props.onScheduleClose}
      >
        <div className={styles.popoverBody}>
          <span className={styles.popoverMessage}>
            {`Replace "${item.labelText}" with "${props.replaceTerm}"?`}
          </span>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Check size={14} />}
            className={styles.fullButton}
            data-testid={TESTING_IDS.searchInlineReplaceButton}
            aria-label={`Apply replace for ${item.labelText}`}
            onClick={(event) => {
              event.stopPropagation();
              props.onApply();
            }}
          >
            Replace
          </Button>
        </div>
      </AnnotationPopover>
    </div>
  );
}
