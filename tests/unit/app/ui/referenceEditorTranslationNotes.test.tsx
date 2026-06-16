// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import React, { act } from "react";
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

import { ReferenceEditor } from "@/app/ui/components/blocks/ReferenceEditor.tsx";

const useWorkspaceContextMock = vi.fn();

vi.mock("@/app/ui/hooks/useWorkspaceContext.tsx", () => ({
  useWorkspaceContext: () => useWorkspaceContextMock(),
}));

function TestProviders(props: { children: React.ReactNode }) {
  return <I18nProvider i18n={i18n}>{props.children}</I18nProvider>;
}

function makeReferenceResource(overrides: Record<string, unknown> = {}) {
  return {
    activeReferenceResource: {
      type: "translationNotes",
      folderName: "en_tn_condensed",
      displayName: "English Translation Notes Condensed",
      managedPath: "/userData/projects/en_tn_condensed",
      projectId: "en_tn_condensed",
      projectType: "resource-container",
      descriptor: {
        id: "en_tn_condensed",
        displayName: "English Translation Notes Condensed",
        type: "translationNotes",
        containerFormat: "resource-container",
        language: {
          code: "en",
          name: "English",
          direction: "ltr",
        },
        readOnly: true,
      },
    },
    activeReferenceResourcePath: "/userData/projects/en_tn_condensed",
    activeReferenceResourceQuery: {
      isLoading: false,
      error: null,
    },
    translationNotesQuery: {
      isLoading: false,
      error: null,
      data: [],
    },
    referenceQuery: {
      isLoading: false,
      error: null,
    },
    referenceBookCode: "LUK",
    referenceChapterNumber: 22,
    supportsReferenceAnchors: true,
    supportsScriptureNavigation: false,
    isReferenceNavSynced: true,
    isReferenceScrollSynced: false,
    setReferenceNavigationSynced: vi.fn(),
    setReferenceScrollingSynced: vi.fn(),
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
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("min-width"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  }
});

beforeEach(() => {
  useWorkspaceContextMock.mockReturnValue({
    referenceEditorRef: { current: null },
    search: { isSearchPaneOpen: false },
    referenceResource: makeReferenceResource(),
  });
});

afterEach(() => {
  useWorkspaceContextMock.mockReset();
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
});

function render(ui: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<TestProviders>{ui}</TestProviders>);
  });
}

describe("ReferenceEditor translation notes", () => {
  it("renders TN content for the active chapter anchor", () => {
    useWorkspaceContextMock.mockReturnValue({
      referenceEditorRef: { current: null },
      search: { isSearchPaneOpen: false },
      referenceResource: makeReferenceResource({
        translationNotesQuery: {
          isLoading: false,
          error: null,
          data: [
            {
              documentId: "luk/22/71.md",
              bookCode: "LUK",
              chapterNumber: 22,
              verseNumber: 71,
              rawMarkdown:
                '# Why do we still need a witness?\n\n"We have no further need for witnesses!"',
            },
          ],
        },
      }),
    });

    render(<ReferenceEditor />);

    expect(document.body.textContent).toContain("Verse 71");
    expect(document.body.textContent).toContain(
      "Why do we still need a witness?",
    );
    expect(document.body.textContent).toContain(
      '"We have no further need for witnesses!"',
    );
  });

  it("shows an explicit empty state when the active chapter has no TN content", () => {
    render(<ReferenceEditor />);

    expect(document.body.textContent).toContain(
      "No translation notes for LUK 22.",
    );
  });

  it("shows a loading state while TN content is loading", () => {
    useWorkspaceContextMock.mockReturnValue({
      referenceEditorRef: { current: null },
      search: { isSearchPaneOpen: false },
      referenceResource: makeReferenceResource({
        translationNotesQuery: {
          isLoading: true,
          error: null,
          data: undefined,
        },
      }),
    });

    render(<ReferenceEditor />);

    expect(document.body.textContent).toContain(
      "Loading translation notes for LUK 22...",
    );
  });

  it("shows an error state when TN content fails to load", () => {
    useWorkspaceContextMock.mockReturnValue({
      referenceEditorRef: { current: null },
      search: { isSearchPaneOpen: false },
      referenceResource: makeReferenceResource({
        translationNotesQuery: {
          isLoading: false,
          error: new Error("boom"),
          data: undefined,
        },
      }),
    });

    render(<ReferenceEditor />);

    expect(document.body.textContent).toContain(
      "Failed to load translation notes for LUK 22",
    );
  });
});
