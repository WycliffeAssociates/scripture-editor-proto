// @vitest-environment jsdom

// Characterization of the neutral result-row presentation seam (`ResultBrowserRow`).
// These are the Section 1 Find characterization tests ported onto the extracted
// component: identical user-visible DOM contract — single vs grouped layout,
// missing-verse fallback, active-row marker, per-verse occurrence stepping,
// replacement preview + submit, the hidden-markup "Edit in USFM mode" affordance,
// and the literal/case/whole-word rules of match-mode highlighting. Assertions
// stay on data-attributes, accessible names, text, and stable class names.

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TESTING_IDS } from "@/app/data/constants.ts";
import { ResultBrowserRow } from "@/app/ui/components/views/result-browser/ResultBrowserRow.tsx";
import type { ResultRow } from "@/app/ui/components/views/result-browser/resultRow.ts";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";

const MISSING = "Verse not available in this text";

function matchHighlight(
  term: string,
  matchCase = false,
  matchWholeWord = false,
) {
  return { mode: "match", term, matchCase, matchWholeWord } as const;
}

function makeRow(overrides: Partial<ResultRow> = {}): ResultRow {
  return {
    key: "GEN 1:1",
    sid: "GEN 1:1",
    locationLabel: "GEN 1:1",
    columns: [
      {
        kind: "target",
        label: "",
        text: "In the beginning God created the heavens and the earth.",
        missingText: MISSING,
        highlight: matchHighlight("God"),
      },
    ],
    active: false,
    onNavigate: () => {},
    testId: TESTING_IDS.searchResultItem,
    dataAttributes: {
      "data-search-sid": "GEN 1:1",
      "data-search-book": "GEN",
      "data-search-chapter": "1",
    },
    ...overrides,
  };
}

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
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
});

function renderRow(row: ResultRow): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <I18nProvider i18n={i18n}>
        <ResultBrowserRow row={row} />
      </I18nProvider>,
    );
  });
  return container;
}

function resetRoot() {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function marks(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll("mark"));
}

describe("ResultBrowserRow — single-column result", () => {
  it("renders the location label, single-row marker, passthrough attrs, and one highlight", () => {
    const el = renderRow(makeRow());

    const item = el.querySelector<HTMLElement>(
      `[data-testid="${TESTING_IDS.searchResultItem}"]`,
    );
    expect(item).not.toBeNull();
    expect(item?.getAttribute("data-search-sid")).toBe("GEN 1:1");
    expect(item?.getAttribute("data-search-book")).toBe("GEN");
    expect(item?.getAttribute("data-search-chapter")).toBe("1");

    expect(el.textContent).toContain("GEN 1:1");
    expect(
      el.querySelector('[aria-label="Navigate to GEN 1:1"]'),
    ).not.toBeNull();

    expect(el.querySelector('[data-result-layout="single"]')).not.toBeNull();
    const found = marks(el);
    expect(found).toHaveLength(1);
    expect(found[0]?.textContent).toBe("God");
    // No `find.replacement` → no replace input.
    expect(el.querySelector('input[placeholder="Replace with..."]')).toBeNull();
  });
});

describe("ResultBrowserRow — grouped source/target result", () => {
  it("renders source and target blocks with their column labels and text", () => {
    const el = renderRow(
      makeRow({
        columns: [
          {
            kind: "source",
            label: "Greek ULB",
            text: "In the beginning God created the heavens.",
            missingText: MISSING,
            highlight: matchHighlight("God"),
          },
          {
            kind: "target",
            label: "My Project",
            text: "When at first God made the skies.",
            missingText: MISSING,
            highlight: matchHighlight("God"),
          },
        ],
      }),
    );

    expect(el.querySelector('[data-result-layout="grouped"]')).not.toBeNull();
    expect(el.querySelector('[data-result-column="source"]')?.textContent).toBe(
      "Greek ULB",
    );
    expect(el.querySelector('[data-result-column="target"]')?.textContent).toBe(
      "My Project",
    );

    expect(el.textContent).toContain(
      "In the beginning God created the heavens.",
    );
    expect(el.textContent).toContain("When at first God made the skies.");
  });

  it("shows the missing-verse fallback when a column's text is blank", () => {
    const el = renderRow(
      makeRow({
        columns: [
          {
            kind: "source",
            label: "Greek ULB",
            text: "In the beginning God created the heavens.",
            missingText: MISSING,
            highlight: matchHighlight("God"),
          },
          {
            kind: "target",
            label: "My Project",
            text: "",
            missingText: MISSING,
            highlight: matchHighlight("God"),
          },
        ],
      }),
    );
    expect(el.textContent).toContain(MISSING);
  });
});

describe("ResultBrowserRow — active row", () => {
  it("adds the active class only when active is set", () => {
    const inactive = renderRow(makeRow({ active: false }));
    expect(
      inactive
        .querySelector<HTMLElement>(
          `[data-testid="${TESTING_IDS.searchResultItem}"]`,
        )
        ?.className.includes(styles.searchResultItemActive),
    ).toBe(false);

    resetRoot();

    const active = renderRow(makeRow({ active: true }));
    expect(
      active
        .querySelector<HTMLElement>(
          `[data-testid="${TESTING_IDS.searchResultItem}"]`,
        )
        ?.className.includes(styles.searchResultItemActive),
    ).toBe(true);
  });
});

describe("ResultBrowserRow — disabled navigation", () => {
  it("disables the navigate control and explains why", () => {
    const el = renderRow(
      makeRow({
        navigateDisabled: true,
        navigateDisabledLabel: "Verse not available in this project",
      }),
    );
    const navigate = el.querySelector<HTMLButtonElement>(
      '[aria-label="Verse not available in this project"]',
    );
    expect(navigate).not.toBeNull();
    expect(navigate?.disabled).toBe(true);
  });
});

describe("ResultBrowserRow — occurrence stepping", () => {
  it("shows a stepper for multi-match verses and moves the active highlight", () => {
    const el = renderRow(
      makeRow({
        columns: [
          {
            kind: "target",
            label: "",
            text: "God God God",
            missingText: MISSING,
            highlight: matchHighlight("God"),
          },
        ],
        find: { occurrenceCount: 3 },
      }),
    );

    const prev = el.querySelector<HTMLButtonElement>(
      `[data-testid="${TESTING_IDS.searchPrevButton}"]`,
    );
    const next = el.querySelector<HTMLButtonElement>(
      `[data-testid="${TESTING_IDS.searchNextButton}"]`,
    );
    expect(prev).not.toBeNull();
    expect(next).not.toBeNull();
    expect(el.textContent).toContain("1/3");
    expect(prev?.disabled).toBe(true);
    expect(next?.disabled).toBe(false);

    let found = marks(el);
    expect(found).toHaveLength(3);
    expect(found[0]?.className).toContain(styles.searchHighlightActive);
    expect(found[1]?.className).toContain(styles.searchHighlight);

    act(() => {
      next?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(el.textContent).toContain("2/3");
    found = marks(el);
    expect(found[1]?.className).toContain(styles.searchHighlightActive);
    expect(found[0]?.className).toContain(styles.searchHighlight);
  });

  it("does not render a stepper for single-match verses", () => {
    const el = renderRow(makeRow({ find: { occurrenceCount: 1 } }));
    expect(
      el.querySelector(`[data-testid="${TESTING_IDS.searchPrevButton}"]`),
    ).toBeNull();
    expect(
      el.querySelector(`[data-testid="${TESTING_IDS.searchNextButton}"]`),
    ).toBeNull();
  });
});

describe("ResultBrowserRow — replacement preview and submit", () => {
  it("previews the replacement inline and commits the entered value", async () => {
    const onCommit = vi.fn(async () => {});
    const el = renderRow(
      makeRow({
        columns: [
          {
            kind: "target",
            label: "",
            text: "God is good",
            missingText: MISSING,
            highlight: matchHighlight("God"),
          },
        ],
        find: {
          occurrenceCount: 1,
          replacement: { defaultValue: "", onCommit },
        },
      }),
    );

    const input = el.querySelector<HTMLInputElement>(
      'input[placeholder="Replace with..."]',
    );
    expect(input).not.toBeNull();

    typeInto(input!, "Lord");

    const preview = el.querySelector<HTMLElement>(
      `.${styles.searchReplacementPreview}`,
    );
    expect(preview?.textContent).toBe("GodLord");
    expect(
      preview?.querySelector(`.${styles.searchReplacementNew}`)?.textContent,
    ).toBe("Lord");
    expect(
      preview?.querySelector(`.${styles.searchReplacementOld}`)?.textContent,
    ).toBe("God");

    const form = el.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Lord", 0);
  });
});

describe("ResultBrowserRow — hidden-markup affordance", () => {
  it("offers Edit in USFM mode instead of a replace input for a gap match", () => {
    const onEditInUsfm = vi.fn();
    const el = renderRow(
      makeRow({
        find: {
          occurrenceCount: 1,
          replacement: {
            defaultValue: "",
            disabledReason: "hidden-markup-gap",
            onCommit: async () => {},
            onEditInUsfm,
          },
        },
      }),
    );

    expect(el.querySelector('input[placeholder="Replace with..."]')).toBeNull();
    const button = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Edit in USFM mode"),
    );
    expect(button).toBeTruthy();

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onEditInUsfm).toHaveBeenCalledTimes(1);
  });
});

describe("ResultBrowserRow — match highlighting rules", () => {
  it("treats the term literally (escapes regex metacharacters)", () => {
    const el = renderRow(
      makeRow({
        columns: [
          {
            kind: "target",
            label: "",
            text: "a.b aXb",
            missingText: MISSING,
            highlight: matchHighlight("a.b"),
          },
        ],
      }),
    );
    const found = marks(el);
    expect(found).toHaveLength(1);
    expect(found[0]?.textContent).toBe("a.b");
  });

  it("honors case sensitivity", () => {
    const sensitive = renderRow(
      makeRow({
        columns: [
          {
            kind: "target",
            label: "",
            text: "God god",
            missingText: MISSING,
            highlight: matchHighlight("God", true),
          },
        ],
      }),
    );
    expect(marks(sensitive)).toHaveLength(1);

    resetRoot();

    const insensitive = renderRow(
      makeRow({
        columns: [
          {
            kind: "target",
            label: "",
            text: "God god",
            missingText: MISSING,
            highlight: matchHighlight("God", false),
          },
        ],
      }),
    );
    expect(marks(insensitive)).toHaveLength(2);
  });

  it("honors whole-word matching", () => {
    const el = renderRow(
      makeRow({
        columns: [
          {
            kind: "target",
            label: "",
            text: "in the inn",
            missingText: MISSING,
            highlight: matchHighlight("in", false, true),
          },
        ],
      }),
    );
    const found = marks(el);
    expect(found).toHaveLength(1);
    expect(found[0]?.textContent).toBe("in");
  });

  it("renders precomputed ranges as marks without matching (STET mode)", () => {
    const el = renderRow(
      makeRow({
        columns: [
          {
            kind: "source",
            label: "English ULB",
            text: "grace and truth",
            missingText: MISSING,
            highlight: { mode: "ranges", ranges: [[0, 5]] },
          },
          {
            kind: "target",
            label: "My Project",
            text: "grace and truth",
            missingText: MISSING,
          },
        ],
      }),
    );
    const found = marks(el);
    expect(found).toHaveLength(1);
    expect(found[0]?.textContent).toBe("grace");
  });
});
