// @vitest-environment jsdom

// Section 4 vertical slice for the STET panel: catalog load via an injected
// source, term filter/selection, definition paragraphs, additive expansion +
// counts, GL/HL missing-text fallbacks, and source-only gloss highlighting.
// The virtualizer is stubbed to render all rows so row content is assertable in
// jsdom (real virtualization is exercised in the running app, not here).

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { makeBook, makeChapter } from "@tests/helpers/workspaceFixtures.ts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { TESTING_IDS } from "@/app/data/constants.ts";
import type { StetCatalog } from "@/app/domain/stet/stetCatalog.ts";
import type { StetCatalogSource } from "@/app/domain/stet/StetCatalogSource.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { StetPanel } from "@/app/ui/components/views/stet-panel/StetPanel.tsx";
import { WorkspaceContext } from "@/app/ui/contexts/_workspaceContext.ts";
import type { WorkSpaceContextType } from "@/app/ui/contexts/WorkspaceContext.tsx";
import { scrollToSidInEditor } from "@/app/ui/hooks/useSearchHighlighter.ts";

// Spy the scroll so the destination test can observe the exact SID handed to it.
vi.mock("@/app/ui/hooks/useSearchHighlighter.ts", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/app/ui/hooks/useSearchHighlighter.ts")
  >()),
  scrollToSidInEditor: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => ({
    getTotalSize: () => opts.count * 120,
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, index) => ({
        index,
        start: index * 120,
        size: 120,
        key: index,
      })),
    measureElement: () => {},
  }),
}));

const GEN_1_1 = "In the beginning God created the heavens and the earth.";

function makeCatalog(): StetCatalog {
  return {
    schemaVersion: 1,
    locale: "en",
    reference: { provenanceId: "sha", displayName: "English ULB (en_ulb)" },
    referenceVerses: {
      "GEN 1:1": GEN_1_1,
      "JHN 1:1": "In the beginning was the Word.",
      "MAT 1:1": "The book of the genealogy of Jesus Christ.",
    },
    terms: [
      {
        term: "Abba",
        englishTerm: "Abba",
        strongs: [5],
        definition: "First line.\n\nSecond line.",
        subsetVerses: [{ ref: "GEN 1:1" }],
        exhaustiveVerses: ["GEN 1:1", "JHN 1:1"],
        glosses: ["God"],
        glossRanges: { "GEN 1:1": [[17, 20]] },
      },
      {
        term: "Grace",
        englishTerm: "Grace",
        strongs: [5485],
        definition: "Favor.",
        subsetVerses: [{ ref: "MAT 1:1" }],
        exhaustiveVerses: [],
        glosses: [],
        glossRanges: {},
      },
    ],
  };
}

function makeSource(catalog: StetCatalog): StetCatalogSource {
  return {
    listGuides: async () => [
      {
        locale: "en",
        displayName: "English ULB (en_ulb)",
        provenanceId: "sha",
        url: "/stet/en.json",
      },
    ],
    loadCatalog: async () => catalog,
  };
}

const NO_FILES: never[] = [];

type ContextOpts = {
  files?: ScriptureBookState[];
  switchBookOrChapter?: (file: string, chapter: number) => unknown;
  /** A truthy fake editor so navigation's deferred scroll actually fires. */
  editor?: unknown;
};

function makeContext(opts: ContextOpts = {}): WorkSpaceContextType {
  const files = opts.files ?? NO_FILES;
  return {
    workingFilesStore: {
      subscribe: () => () => {},
      getSnapshot: () => files,
      read: () => files,
    },
    bookCodeToProjectLocalizedTitle: ({ bookCode }: { bookCode: string }) =>
      bookCode,
    allProjects: [],
    currentProjectRoute: "proj",
    editorRef: { current: opts.editor ?? null },
    actions: {
      switchBookOrChapter: opts.switchBookOrChapter ?? (() => undefined),
    },
  } as unknown as WorkSpaceContextType;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let queryClient: QueryClient | null = null;

beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  queryClient?.clear();
  root = null;
  container = null;
  queryClient = null;
});

function flush() {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitForText(text: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (document.body.textContent?.includes(text)) return;
    await flush();
  }
  throw new Error(`Timed out waiting for text: ${text}`);
}

function render(source: StetCatalogSource, contextOpts: ContextOpts = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient!}>
        <I18nProvider i18n={i18n}>
          <WorkspaceContext.Provider value={makeContext(contextOpts)}>
            <StetPanel source={source} />
          </WorkspaceContext.Provider>
        </I18nProvider>
      </QueryClientProvider>,
    );
  });
}

function termButtons(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      `[data-testid="${TESTING_IDS.stet.termItem}"]`,
    ),
  );
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

describe("StetPanel — Section 4 vertical slice", () => {
  it("loads the catalog, selects the first term, and renders its definition + coverage", async () => {
    render(makeSource(makeCatalog()));
    await waitForText("Abba");

    // Alphabetized terms; first is selected by default.
    expect(termButtons().map((b) => b.textContent)).toEqual(["Abba", "Grace"]);

    // Definition paragraphs rendered as plain text.
    expect(document.body.textContent).toContain("First line.");
    expect(document.body.textContent).toContain("Second line.");

    // Curated coverage (1 designated, 0 present — empty HL project).
    const coverage = document.querySelector(
      `[data-testid="${TESTING_IDS.stet.coverage}"]`,
    );
    expect(coverage?.textContent).toBe(
      "0 of 1 verses available in this project",
    );

    // Pinned reference name is shown.
    expect(document.body.textContent).toContain("English ULB (en_ulb)");
  });

  it("highlights only the source column and shows the HL missing fallback", async () => {
    render(makeSource(makeCatalog()));
    await waitForText("Abba");

    const marks = Array.from(document.querySelectorAll("mark"));
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("God"); // GEN 1:1 [17,20)

    // HL side missing → explicit fallback, not silent drop.
    expect(document.body.textContent).toContain(
      "Verse not available in this project",
    );
  });

  it("expands additively with a union-count toggle and resets on term change", async () => {
    render(makeSource(makeCatalog()));
    await waitForText("Abba");

    const toggle = document.querySelector<HTMLButtonElement>(
      `[data-testid="${TESTING_IDS.stet.exhaustiveToggle}"]`,
    );
    expect(toggle?.textContent).toBe("Show all occurrences (2)");

    act(() => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const coverage = document.querySelector(
      `[data-testid="${TESTING_IDS.stet.coverage}"]`,
    );
    expect(coverage?.textContent).toBe(
      "0 of 2 verses available in this project",
    );
    const expanded = document.querySelector<HTMLButtonElement>(
      `[data-testid="${TESTING_IDS.stet.exhaustiveToggle}"]`,
    );
    expect(expanded?.textContent).toBe("Show curated verses only (1)");

    // Switching to Grace (no exhaustive extra) drops the toggle.
    const grace = termButtons().find((b) => b.textContent === "Grace");
    act(() => {
      grace?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(
      document.querySelector(
        `[data-testid="${TESTING_IDS.stet.exhaustiveToggle}"]`,
      ),
    ).toBeNull();
  });

  it("filters the term list to matches", async () => {
    render(makeSource(makeCatalog()));
    await waitForText("Abba");

    const filter = document.querySelector<HTMLInputElement>(
      `[data-testid="${TESTING_IDS.stet.filterInput}"]`,
    );
    typeInto(filter!, "gra");
    await flush();

    expect(termButtons().map((b) => b.textContent)).toEqual(["Grace"]);
  });

  it("navigates a row to the exact SID (same-chapter and cross-book/chapter)", async () => {
    vi.mocked(scrollToSidInEditor).mockClear();
    const switchBookOrChapter = vi.fn(() => ({}) as never);
    const editor = { marker: "editor" };
    // Curated GEN 1:1 (chapter 1) + exhaustive JHN 3:1 (a *different* chapter, so
    // a hardcoded chapter number couldn't pass). Distinct source text avoids the
    // main-catalog fixture.
    const navCatalog: StetCatalog = {
      schemaVersion: 1,
      locale: "en",
      reference: { provenanceId: "sha", displayName: "English ULB (en_ulb)" },
      referenceVerses: {
        "GEN 1:1": "Genesis source verse.",
        "JHN 3:1": "John source verse.",
      },
      terms: [
        {
          term: "Abba",
          englishTerm: "Abba",
          strongs: [5],
          definition: "def",
          subsetVerses: [{ ref: "GEN 1:1" }],
          exhaustiveVerses: ["GEN 1:1", "JHN 3:1"],
          glosses: [],
          glossRanges: {},
        },
      ],
    };
    render(makeSource(navCatalog), {
      // HL for GEN 1:1 and JHN 3:1 → both rows navigable.
      files: [
        makeBook({ bookCode: "GEN" }),
        makeBook({
          bookCode: "JHN",
          chapters: [makeChapter({ bookCode: "JHN", chapterNumber: 3 })],
        }),
      ],
      switchBookOrChapter,
      editor,
    });
    await waitForText("Genesis source verse.");

    const click = (selector: string) => {
      act(() => {
        document
          .querySelector<HTMLButtonElement>(selector)
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    };

    // Same-chapter: GEN 1:1 → switch("GEN", 1) and scroll exactly "GEN 1:1".
    click('[aria-label="Navigate to GEN 1:1"]');
    await flush();
    expect(switchBookOrChapter).toHaveBeenLastCalledWith("GEN", 1);
    expect(scrollToSidInEditor).toHaveBeenLastCalledWith(editor, "GEN 1:1");

    // Cross-book/chapter: expand, then JHN 3:1 → switch("JHN", 3), scroll "JHN 3:1".
    click(`[data-testid="${TESTING_IDS.stet.exhaustiveToggle}"]`);
    await flush();
    click('[aria-label="Navigate to JHN 3:1"]');
    await flush();
    expect(switchBookOrChapter).toHaveBeenLastCalledWith("JHN", 3);
    expect(scrollToSidInEditor).toHaveBeenLastCalledWith(editor, "JHN 3:1");
  });

  it("shows a distinct empty state when the catalog has no terms", async () => {
    const empty = makeCatalog();
    empty.terms = [];
    render(makeSource(empty));
    await waitForText("No spiritual terms are available.");
    expect(
      document.querySelector(`[data-testid="${TESTING_IDS.stet.emptyState}"]`),
    ).not.toBeNull();
  });

  it("shows a load error with retry when the catalog fails", async () => {
    const source: StetCatalogSource = {
      listGuides: async () => [
        {
          locale: "en",
          displayName: "English ULB (en_ulb)",
          provenanceId: "sha",
          url: "/stet/en.json",
        },
      ],
      loadCatalog: async () => {
        throw new Error("boom");
      },
    };
    render(source);
    await waitForText("Could not load the spiritual terms catalog.");
    expect(
      document.querySelector(`[data-testid="${TESTING_IDS.stet.retryButton}"]`),
    ).not.toBeNull();
  });
});
