// @vitest-environment jsdom

import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  CloudProjectStatusBadge,
  CloudProjectStatusBanner,
} from "@/app/ui/components/blocks/CloudProjectStatus.tsx";
import {
  GIT_REMOTE_PROJECT_STATUS_CONNECTED,
  GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
  GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
  type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function enableReactActEnvironment() {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
}

beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
  enableReactActEnvironment();
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

afterEach(() => {
  act(() => {
    root?.unmount();
  });
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
    root?.render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);
  });
}

function makeStatus(kind: GitRemoteProjectStatus["kind"]): GitRemoteProjectStatus {
  return {
    projectPath: "/userData/projects/foo",
    kind,
    lastCheckedAt: null,
    lastPublishedAt: null,
    lastKnownLocalHead: null,
    lastKnownRemoteHead: null,
  };
}

describe("cloud project status UI", () => {
  it("shows a compact connected badge without a banner", () => {
    render(
      <>
        <CloudProjectStatusBadge
          status={makeStatus(GIT_REMOTE_PROJECT_STATUS_CONNECTED)}
          isRefreshing={false}
        />
        <CloudProjectStatusBanner
          status={makeStatus(GIT_REMOTE_PROJECT_STATUS_CONNECTED)}
          isRefreshing={false}
          onSync={vi.fn()}
          onReview={vi.fn()}
        />
      </>,
    );

    expect(document.body.textContent).toContain("Connected");
    expect(document.body.textContent).not.toContain("Changes not yet published");
  });

  it("renders a review banner for incoming cloud changes that need review", () => {
    const onReview = vi.fn();
    render(
      <CloudProjectStatusBanner
        status={makeStatus(GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW)}
        isRefreshing={false}
        onSync={vi.fn()}
        onReview={onReview}
      />,
    );

    expect(document.body.textContent).toContain("Cloud and local changes need review");
    expect(document.body.textContent).toContain("Review changes");
    act(() => {
      document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("renders a sync action when changes are not yet published", () => {
    const onSync = vi.fn();
    render(
      <CloudProjectStatusBanner
        status={makeStatus(GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH)}
        isRefreshing={false}
        onSync={onSync}
        onReview={vi.fn()}
      />,
    );

    expect(document.body.textContent).toContain(
      "Your latest local save has not been published to the cloud yet.",
    );
    expect(document.body.textContent).toContain("Sync now");
    act(() => {
      document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSync).toHaveBeenCalledTimes(1);
  });
});
