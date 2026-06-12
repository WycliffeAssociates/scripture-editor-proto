import { useEffect, useEffectEvent, useRef, useState } from "react";

import { DATA_JS } from "@/app/data/constants.ts";

type ScrollSnapshot = {
  left: number;
  top: number;
  element: HTMLElement;
};

// Generic over the annotation item type — this hook owns hover timing and the
// state machine, not what an annotation IS; the caller's lookup decides that.
export type UseEditorFindingsTooltipReturn<T> = {
  hoveredAnnotations: T[] | null;
  /** The hovered overlay element (badge or highlight box) to anchor against. */
  hoveredAnchorEl: HTMLElement | null;
  onTooltipMouseEnter: () => void;
  onTooltipMouseLeave: () => void;
};

// Hover targets are EITHER an interactive overlay element (the `!` badge, which
// carries `data-js`) OR the underlying flagged token itself (which carries
// `data-lint-hitpoint`). The highlight box is click-through and is NOT a hover
// target — hovering the token text under it is what opens the popover, so the
// text stays selectable/editable.
const LINT_HITPOINT_SELECTOR = `[data-js="${DATA_JS.lintDomOverlayHitpoint}"], [data-lint-hitpoint]`;

function asHtmlElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target;
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

function findScrollContainer(start: HTMLElement): HTMLElement {
  let current: HTMLElement | null = start;
  while (current) {
    const styles = window.getComputedStyle(current);
    const canScrollY =
      /(auto|scroll|overlay)/.test(styles.overflowY) &&
      current.scrollHeight > current.clientHeight;
    const canScrollX =
      /(auto|scroll|overlay)/.test(styles.overflowX) &&
      current.scrollWidth > current.clientWidth;
    if (canScrollY || canScrollX) {
      return current;
    }
    current = current.parentElement;
  }
  return start;
}

function getDocumentScrollElement(element: HTMLElement): HTMLElement {
  return (element.ownerDocument.scrollingElement ??
    element.ownerDocument.documentElement) as HTMLElement;
}

/**
 * Drive the hover tooltip for annotations rendered inside the editor DOM.
 *
 * Annotations are attached to token DOM nodes (`data-lint-hitpoint`) after the
 * overlay resolves. This hook owns the hover timing + state machine and listens
 * at the document level so the tooltip stays open while the pointer moves
 * between the highlighted token and the overlay itself. WHICH annotations a
 * hovered element carries is the caller's concern — it passes `lookupForTarget`
 * (onion lint by token-id + sous content findings by their touched token-ids,
 * the hover zip).
 */
export function useEditorFindingsTooltip<T>(
  lookupForTarget: (target: HTMLElement) => T[],
  // Geometric hit-test for content findings: their highlights are
  // click-through (so the editor stays clickable underneath), so they can't be
  // pointer hitpoints — instead we hit-test the cursor against their rects on
  // mousemove and treat the matched highlight element (carrying
  // `data-annotation-id`) as the hover target.
  findContentHit?: (clientX: number, clientY: number) => HTMLElement | null,
): UseEditorFindingsTooltipReturn<T> {
  const SCROLL_CLOSE_THRESHOLD = 7;
  const [hoveredAnnotations, setHoveredAnnotations] = useState<T[] | null>(
    null,
  );
  const [hoveredAnchorEl, setHoveredAnchorEl] = useState<HTMLElement | null>(
    null,
  );
  const hoverAnnotationsRef = useRef<T[] | null>(null);
  // Identity of the issue currently shown or pending (data-id / sid). Lets us
  // ignore repeat mouseovers across the same issue's boxes so the popover
  // anchors once and stays put instead of jittering as the pointer moves.
  const activeKeyRef = useRef<string | null>(null);
  // Whether the shown popover came from a content (geometric) hover vs a lint
  // hitpoint — content hide is driven by mousemove leaving the rect, lint hide
  // by mouseout, so we must not cross them up.
  const activeKindRef = useRef<"lint" | "content" | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const showTimeoutRef = useRef<number | null>(null);
  const scrollSnapshotRef = useRef<ScrollSnapshot | null>(null);
  const onTooltipMouseEnterRef = useRef<() => void>(() => undefined);
  const onTooltipMouseLeaveRef = useRef<() => void>(() => undefined);

  const findAnnotationsForTarget = useEffectEvent((target: HTMLElement) =>
    lookupForTarget(target),
  );
  const hitTestContent = useEffectEvent(
    (clientX: number, clientY: number): HTMLElement | null =>
      findContentHit ? findContentHit(clientX, clientY) : null,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `findErrorsForTarget` is a useEffectEvent binding with stable identity by contract; including it in deps would defeat the point.
  useEffect(() => {
    const isWithinOverlay = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(target.closest(LINT_HITPOINT_SELECTOR));
    };
    const isWithinLintTooltip = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return null;
      return target.closest(`[data-js="${DATA_JS.lintTooltipOverlay}"]`);
    };
    const clearHideTimeout = () => {
      if (!hideTimeoutRef.current) return;
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    };
    const hideTooltip = () => {
      if (showTimeoutRef.current) {
        window.clearTimeout(showTimeoutRef.current);
        showTimeoutRef.current = null;
      }
      clearHideTimeout();
      hoverAnnotationsRef.current = null;
      activeKeyRef.current = null;
      activeKindRef.current = null;
      setHoveredAnnotations(null);
      setHoveredAnchorEl(null);
      scrollSnapshotRef.current = null;
    };

    const scheduleHideTooltip = () => {
      clearHideTimeout();
      hideTimeoutRef.current = window.setTimeout(() => {
        hideTooltip();
      }, 180);
    };

    // Show the popover for a hover target (a lint hitpoint, or a content
    // finding's highlight rect). `data-annotation-id` keys content findings
    // (many can share a token's data-id/sid), so switching between them
    // re-anchors instead of being treated as the same issue.
    const showForTarget = (
      targetForErrors: HTMLElement,
      kind: "lint" | "content",
    ) => {
      const key =
        targetForErrors.getAttribute("data-annotation-id") ??
        targetForErrors.getAttribute("data-id") ??
        targetForErrors.getAttribute("data-sid");
      if (key && activeKeyRef.current === key) return;

      const annotationsForNode = findAnnotationsForTarget(targetForErrors);
      if (annotationsForNode.length === 0) return;

      if (showTimeoutRef.current) {
        window.clearTimeout(showTimeoutRef.current);
        showTimeoutRef.current = null;
      }

      activeKeyRef.current = key;
      activeKindRef.current = kind;
      showTimeoutRef.current = window.setTimeout(() => {
        hoverAnnotationsRef.current = annotationsForNode;
        setHoveredAnnotations(annotationsForNode);
        setHoveredAnchorEl(targetForErrors);
        const scrollContainer = findScrollContainer(
          targetForErrors.parentElement ?? targetForErrors,
        );
        scrollSnapshotRef.current = {
          element: scrollContainer,
          left: scrollContainer.scrollLeft,
          top: scrollContainer.scrollTop,
        };
      }, 200);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = asHtmlElement(e.target);
      if (isWithinLintTooltip(target)) {
        clearHideTimeout();
        return;
      }

      const targetForErrors = target?.closest(
        LINT_HITPOINT_SELECTOR,
      ) as HTMLElement | null;
      if (!targetForErrors) return;
      clearHideTimeout();
      showForTarget(targetForErrors, "lint");
    };

    // Content findings are click-through (not hitpoints), so mouseover never
    // fires for them — hit-test the cursor against their rects on move.
    const handleMouseMove = (e: MouseEvent) => {
      if (!findContentHit) return;
      const target = asHtmlElement(e.target);
      if (isWithinLintTooltip(target)) return; // tooltip hover keeps it open
      // A lint hitpoint under the cursor is mouseover's job; don't fight it.
      if (target?.closest(LINT_HITPOINT_SELECTOR)) return;

      const contentEl = hitTestContent(e.clientX, e.clientY);
      if (contentEl) {
        clearHideTimeout();
        showForTarget(contentEl, "content");
      } else if (activeKindRef.current === "content") {
        // Left the content rect (onto plain editor text) — close it.
        scheduleHideTooltip();
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget;
      if (isWithinLintTooltip(related) || isWithinOverlay(related)) {
        return;
      }
      const target = asHtmlElement(e.target);
      if (
        !target?.closest(LINT_HITPOINT_SELECTOR) &&
        !target?.closest(`[data-js="${DATA_JS.lintTooltipOverlay}"]`)
      ) {
        return;
      }
      scheduleHideTooltip();
    };

    const handleScroll = (e: Event) => {
      const snapshot = scrollSnapshotRef.current;
      if (!snapshot || !hoverAnnotationsRef.current) return;
      const target = e.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      if (target !== snapshot.element) return;

      const deltaLeft = Math.abs(target.scrollLeft - snapshot.left);
      const deltaTop = Math.abs(target.scrollTop - snapshot.top);
      if (Math.max(deltaLeft, deltaTop) > SCROLL_CLOSE_THRESHOLD) {
        hideTooltip();
      }
    };

    const scrollContainers = Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-js="${DATA_JS.editorScrollContainer}"], [data-js="${DATA_JS.referenceEditorScrollContainer}"]`,
      ),
    );
    const extraScrollContainers = new Set<HTMLElement>();
    const activeHitpoints = Array.from(
      document.querySelectorAll<HTMLElement>(LINT_HITPOINT_SELECTOR),
    );
    for (const hitpoint of activeHitpoints) {
      extraScrollContainers.add(
        findScrollContainer(hitpoint.parentElement ?? hitpoint),
      );
      extraScrollContainers.add(getDocumentScrollElement(hitpoint));
    }
    const mergedScrollContainers = Array.from(
      new Set([...scrollContainers, ...extraScrollContainers]),
    );

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("mouseout", handleMouseOut);
    if (findContentHit) {
      document.addEventListener("mousemove", handleMouseMove);
    }
    mergedScrollContainers.forEach((container) => {
      container.addEventListener("scroll", handleScroll, {
        passive: true,
      });
    });
    window.addEventListener("scroll", handleScroll, { passive: true });

    onTooltipMouseEnterRef.current = () => {
      clearHideTimeout();
    };
    onTooltipMouseLeaveRef.current = () => {
      scheduleHideTooltip();
    };

    return () => {
      if (showTimeoutRef.current) {
        window.clearTimeout(showTimeoutRef.current);
        showTimeoutRef.current = null;
      }
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseout", handleMouseOut);
      document.removeEventListener("mousemove", handleMouseMove);
      mergedScrollContainers.forEach((container) => {
        container.removeEventListener("scroll", handleScroll);
      });
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return {
    hoveredAnnotations,
    hoveredAnchorEl,
    onTooltipMouseEnter: () => onTooltipMouseEnterRef.current(),
    onTooltipMouseLeave: () => onTooltipMouseLeaveRef.current(),
  };
}
