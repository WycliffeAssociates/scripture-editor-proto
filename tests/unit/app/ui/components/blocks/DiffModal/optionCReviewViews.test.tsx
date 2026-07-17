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

  it("renders moved content in two linked chapter slots with one shared decision", () => {
    const view = render(
      <ChapterDiffStructuredDocument
        chapter={chapter()}
        filters={{ hideWhitespaceOnly: true }}
        leftLabel="Saved"
        rightLabel="Working"
        readOnly={false}
        showUsfmMarkers={false}
        onDecisionChange={() => {}}
      />,
    );

    const moved = view.querySelectorAll('[data-compare-unit-id="move"]');
    expect(moved).toHaveLength(2);
    expect(moved[0]?.getAttribute("data-linked-slot-index")).toBe("2");
    expect(moved[1]?.getAttribute("data-linked-slot-index")).toBe("0");
    expect(
      moved[0]?.querySelector('a[href="#compare-slot-2"]')?.textContent,
    ).toContain("Show other position");
    expect(
      Array.from(moved).every(
        (row) =>
          row.querySelector<HTMLInputElement>('input[value="right"]')?.checked,
      ),
    ).toBe(false);
    expect(
      Array.from(moved).every(
        (row) =>
          row.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]
            ?.checked,
      ),
    ).toBe(true);
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
