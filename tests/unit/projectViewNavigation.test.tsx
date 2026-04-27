// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectView } from "@/app/ui/components/views/ProjectView.tsx";

const useWorkspaceContextMock = vi.fn();
const desktopLayoutMock = vi.fn();

vi.mock("@/app/ui/hooks/useWorkspaceContext.tsx", () => ({
  useWorkspaceContext: () => useWorkspaceContextMock(),
}));

vi.mock("@/app/ui/contexts/MediaQuery.tsx", () => ({
  useWorkspaceMediaQuery: () => ({
    isSm: false,
    mobileTab: "main",
    setMobileTab: vi.fn(),
  }),
}));

vi.mock("@/app/ui/components/views/layout/DesktopLayout.tsx", () => ({
  DesktopLayout: (props: Record<string, unknown>) => {
    desktopLayoutMock(props);
    return <div data-testid="desktop-layout" />;
  },
}));

vi.mock("@/app/ui/components/views/layout/MobileLayout.tsx", () => ({
  MobileLayout: () => <div data-testid="mobile-layout" />,
}));

function TestProviders(props: { children: React.ReactNode }) {
  return <I18nProvider i18n={i18n}>{props.children}</I18nProvider>;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function makeWorkspaceValue(overrides: Record<string, unknown> = {}) {
  return {
    save: {
      versions: {
        ensureLoaded: vi.fn(),
      },
    },
    search: {
      isSearchPaneOpen: false,
      setIsSearchPaneOpen: vi.fn(),
    },
    ...overrides,
  };
}

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
  desktopLayoutMock.mockReset();
  useWorkspaceContextMock.mockReturnValue(makeWorkspaceValue());
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

describe("ProjectView boundary state", () => {
  it("renders the desktop layout at the first chapter boundary", () => {
    useWorkspaceContextMock.mockReturnValue(
      makeWorkspaceValue({
        actions: {
          prevChapter: { hasPrev: false, display: "", go: vi.fn() },
          nextChapter: { hasNext: true, display: "2", go: vi.fn() },
        },
      }),
    );

    render(<ProjectView />);

    expect(document.querySelector('[data-testid="desktop-layout"]')).not.toBeNull();
    expect(desktopLayoutMock).toHaveBeenCalledTimes(1);
  });

  it("renders the desktop layout at the last chapter boundary", () => {
    useWorkspaceContextMock.mockReturnValue(
      makeWorkspaceValue({
        actions: {
          prevChapter: { hasPrev: true, display: "21", go: vi.fn() },
          nextChapter: { hasNext: false, display: "", go: vi.fn() },
        },
      }),
    );

    render(<ProjectView />);

    expect(document.querySelector('[data-testid="desktop-layout"]')).not.toBeNull();
    expect(desktopLayoutMock).toHaveBeenCalledTimes(1);
  });

  it("passes a closed reference pane state by default", () => {
    render(<ProjectView />);

    const firstCall = desktopLayoutMock.mock.calls[0]?.[0] as
      | { hasReferenceResource?: boolean }
      | undefined;
    expect(firstCall?.hasReferenceResource).toBe(false);
  });
});
