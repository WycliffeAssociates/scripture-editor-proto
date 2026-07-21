// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  CompareChapterDecisions,
  FrozenChapterComparison,
} from "@/app/domain/project/compare/types.ts";
import { ChapterDiffStructuredDocument } from "@/app/ui/components/blocks/DiffModal/DiffModalChapterView.tsx";
import {
  type ComparePresentationChapter,
  VirtualizedDiffList,
} from "@/app/ui/components/blocks/DiffModal/DiffModalListView.tsx";
import type {
  DecisionUnit,
  DiffSkeleton,
  Token,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom reports zero `offsetHeight`/`offsetWidth` for every element, which is
  // exactly what @tanstack/react-virtual (used by the list view) reads to size
  // its scroll container — with it at 0, the virtualizer's visible range is
  // empty and nothing renders. Give every element a generous fake size so this
  // small fixture's rows all fall inside the visible range.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 2000,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 800,
  });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const token = (id: string, source = id): Token => ({
  id,
  kind: "text",
  source,
  sid: `GEN 1:${id}`,
});

const unit = (overrides: Partial<DecisionUnit>): DecisionUnit => ({
  id: "unit",
  kind: "coalesced",
  status: "modified",
  baselineSid: "GEN 1:1",
  currentSid: "GEN 1:1",
  baselineTokens: [token("left", "old")],
  currentTokens: [token("right", "new")],
  displaced: false,
  relabeled: false,
  dupContext: { baselineCount: 1, currentCount: 1 },
  isWhitespaceChange: false,
  isUsfmStructureChange: false,
  ...overrides,
});

const skeleton: DiffSkeleton = {
  slots: [
    { unitId: "move", role: "pairCurrent" },
    { unitId: "same", role: "shared" },
    { unitId: "move", role: "pairBaseline" },
    { unitId: "ws", role: "currentOnly" },
  ],
  units: [
    unit({ id: "move", status: "moved", displaced: true }),
    unit({ id: "same", status: "unchanged" }),
    unit({
      id: "ws",
      kind: "added",
      status: "added",
      baselineSid: undefined,
      baselineTokens: [],
      isWhitespaceChange: true,
    }),
  ],
};

function comparison(
  overrides: Partial<FrozenChapterComparison> = {},
): FrozenChapterComparison {
  const side = {
    present: true,
    dirty: false,
    eol: "\n" as const,
    direction: null,
    book: null,
    tokens: [] as readonly Token[],
  };
  return {
    address: { bookCode: "GEN", chapterNum: 1 },
    left: side,
    right: side,
    skeleton,
    ...overrides,
  };
}

function chapter(
  args: {
    comparison?: FrozenChapterComparison;
    decisions?: CompareChapterDecisions;
  } = {},
): ComparePresentationChapter {
  return {
    comparison: args.comparison ?? comparison(),
    label: "Genesis 1",
    decisions: args.decisions ?? { units: { move: "right" }, presence: null },
  };
}

function render(node: React.ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<I18nProvider i18n={i18n}>{node}</I18nProvider>));
  return container;
}

describe("Option C list and chapter review views", () => {
  it("renders a moved unit once in the list and exposes true radio plus Clear decisions", () => {
    const onDecisionChange = vi.fn();
    const view = render(
      <VirtualizedDiffList
        chapters={[chapter()]}
        filters={{ hideWhitespaceOnly: true }}
        leftLabel="Saved"
        rightLabel="Working"
        readOnly={false}
        showUsfmMarkers={false}
        onDecisionChange={onDecisionChange}
      />,
    );

    expect(view.querySelectorAll('[data-compare-unit-id="move"]')).toHaveLength(
      1,
    );
    expect(view.querySelector('[data-compare-unit-id="ws"]')).toBeNull();
    const radios = view.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );
    expect(radios).toHaveLength(2);
    expect(radios[1]?.checked).toBe(true);

    const clear = Array.from(view.querySelectorAll("button")).find(
      (button) => button.textContent === "Clear",
    );
    act(() => clear?.click());
    expect(onDecisionChange).toHaveBeenCalledWith(
      { bookCode: "GEN", chapterNum: 1 },
      "move",
      null,
    );
  });

  it("splits a moved unit's decision across its origin and destination slots", () => {
    const onDecisionChange = vi.fn();
    const view = render(
      <ChapterDiffStructuredDocument
        chapter={chapter()}
        filters={{ hideWhitespaceOnly: true }}
        leftLabel="Saved"
        rightLabel="Working"
        readOnly={false}
        showUsfmMarkers={false}
        onDecisionChange={onDecisionChange}
      />,
    );

    // The skeleton lays the moved unit out at both its real positions — the
    // origin (pairBaseline) slot only offers a "use original position"
    // toggle, the destination (pairCurrent) slot only "use new position",
    // and both act on the same shared decision. Neither slot renders the
    // full left/right/clear fieldset.
    const cells = view.querySelectorAll('[data-compare-unit-id="move"]');
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) expect(c.querySelector("fieldset")).toBeNull();
    expect(view.textContent).toMatch(/was after|now after/);

    const toggles = view.querySelectorAll<HTMLButtonElement>(
      '[class*="compareMoveSideToggle"]',
    );
    expect(toggles).toHaveLength(2);
    // Skeleton slot order puts the destination (pairCurrent) slot first.
    // decisions: { move: "right" } — its toggle is pressed; the origin
    // (pairBaseline) slot's toggle is not.
    expect(toggles[0]?.dataset.pressed).toBe("true");
    expect(toggles[1]?.dataset.pressed).toBeUndefined();

    act(() => toggles[0]?.click());
    expect(onDecisionChange).toHaveBeenCalledWith(
      { bookCode: "GEN", chapterNum: 1 },
      "move",
      null,
    );
  });

  it("removes all decision controls in read-only comparison mode", () => {
    const view = render(
      <ChapterDiffStructuredDocument
        chapter={chapter()}
        leftLabel="Version A"
        rightLabel="Version B"
        readOnly
        showUsfmMarkers={false}
        onDecisionChange={() => {
          throw new Error("must not be called");
        }}
      />,
    );
    expect(view.querySelector("fieldset")).toBeNull();
    expect(view.textContent).toContain("Version A");
    expect(view.textContent).toContain("Version B");
  });

  it("renders a chapter-presence decision when no Onion unit can express it", () => {
    const onPresenceDecision = vi.fn();
    const emptySkeleton: DiffSkeleton = { slots: [], units: [] };
    const leftOnly = comparison({
      skeleton: emptySkeleton,
      left: { ...comparison().left, present: true },
      right: { ...comparison().right, present: false },
    });
    const view = render(
      <VirtualizedDiffList
        chapters={[chapter({ comparison: leftOnly })]}
        leftLabel="Saved"
        rightLabel="Incoming"
        readOnly={false}
        showUsfmMarkers={false}
        onPresenceDecision={onPresenceDecision}
      />,
    );

    expect(view.textContent).toContain(
      "This whole chapter exists on only one side",
    );
    const rightRadio = view.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    )[1];
    act(() => rightRadio?.click());
    expect(onPresenceDecision).toHaveBeenCalledWith(
      { bookCode: "GEN", chapterNum: 1 },
      "right",
    );
  });
});
