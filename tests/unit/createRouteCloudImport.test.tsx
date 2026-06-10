// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { CreateProject } from "@/app/routes/create.tsx";

const useRouterMock = vi.fn();
const notifications = {
  showErrorNotification: vi.fn(),
  showNotificationInfo: vi.fn(),
  showNotificationSuccess: vi.fn(),
  showProgressNotification: vi.fn((..._args: unknown[]) => "notif-id"),
  updateProgressNotification: vi.fn(),
  hideNotification: vi.fn(),
};

// The create route's job is to wire SourcePicker's callbacks to the import
// facade and surface progress/result toasts — the picker's own catalog browse,
// search, and paste-a-link behavior live in (and are tested with) SourcePicker.
// Stub it to a couple of buttons that fire the props the route owns.
const ZIP_URL = "https://gitea.example.org/alice/bho-bible/archive/master.zip";
vi.mock("@/app/ui/components/blocks/SourcePicker/SourcePicker.tsx", () => ({
  SourcePicker: (props: {
    onDownload: (zipUrl: string) => void;
    giteaHostBaseUrl?: string | null;
    isBusy?: boolean;
  }) => (
    <div>
      <span data-testid="picker-host">{props.giteaHostBaseUrl ?? "none"}</span>
      <span data-testid="picker-busy">{String(Boolean(props.isBusy))}</span>
      <button type="button" onClick={() => props.onDownload(ZIP_URL)}>
        download source
      </button>
    </div>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} />
  ),
  useRouter: () => useRouterMock(),
}));

vi.mock("@/app/ui/i18n/loadLocale.tsx", () => ({
  loadLocale: vi.fn(async () => {}),
}));

vi.mock("@/app/ui/components/blocks/ProjectSettings/Settings.tsx", () => ({
  LanguageSelector: (props: {
    value: string | null;
    onChange: (value: string | null) => void;
  }) => (
    <button type="button" onClick={() => props.onChange(props.value)}>
      language
    </button>
  ),
}));

vi.mock("@/app/ui/components/primitives/notifications.ts", () => ({
  showErrorNotification: (...args: unknown[]) =>
    notifications.showErrorNotification(...args),
  showNotificationInfo: (...args: unknown[]) =>
    notifications.showNotificationInfo(...args),
  showNotificationSuccess: (...args: unknown[]) =>
    notifications.showNotificationSuccess(...args),
  showProgressNotification: (...args: unknown[]) =>
    notifications.showProgressNotification(...args),
  updateProgressNotification: (...args: unknown[]) =>
    notifications.updateProgressNotification(...args),
  hideNotification: (...args: unknown[]) =>
    notifications.hideNotification(...args),
}));

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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  queryClient?.clear();
  queryClient = null;
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
  useRouterMock.mockReset();
  for (const spy of Object.values(notifications)) spy.mockReset();
  notifications.showProgressNotification.mockReturnValue("notif-id");
});

function render(ui: React.ReactNode) {
  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient!}>
        <I18nProvider i18n={i18n}>{ui}</I18nProvider>
      </QueryClientProvider>,
    );
  });
}

function mountWithImportRemoteZip(importRemoteZip: ReturnType<typeof vi.fn>) {
  const invalidate = vi.fn(async () => {});
  useRouterMock.mockReturnValue({
    invalidate,
    navigate: vi.fn(),
    options: {
      context: {
        settingsManager: {
          get: vi.fn().mockReturnValue("en"),
          set: vi.fn(),
          applySettings: vi.fn(),
          update: vi.fn(),
        },
        importService: { importRemoteZip },
        projectsService: {},
        giteaHostBaseUrl: "https://gitea.example.org",
      },
    },
  });
  render(<CreateProject />);
  return { invalidate };
}

async function clickDownload() {
  const button = [...document.querySelectorAll("button")].find((node) =>
    node.textContent?.includes("download source"),
  );
  expect(button).toBeTruthy();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("CreateProject source import", () => {
  it("downloads the chosen source through the import facade and refreshes the router", async () => {
    const importRemoteZip = vi.fn().mockResolvedValue({
      project: { projectPath: "/userData/projects/bho-bible" },
      isEditableProject: false,
      requiresMetadataReview: false,
      warning: undefined,
    });
    const { invalidate } = mountWithImportRemoteZip(importRemoteZip);

    await clickDownload();

    expect(importRemoteZip).toHaveBeenCalledWith(
      { type: "fromGitRepo", url: ZIP_URL },
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
    expect(invalidate).toHaveBeenCalled();
    expect(notifications.showNotificationSuccess).toHaveBeenCalled();
    expect(notifications.showErrorNotification).not.toHaveBeenCalled();
  });

  it("surfaces an error notification when the download fails", async () => {
    const importRemoteZip = vi
      .fn()
      .mockRejectedValue(new Error("network down"));
    const { invalidate } = mountWithImportRemoteZip(importRemoteZip);

    await clickDownload();

    expect(notifications.showErrorNotification).toHaveBeenCalled();
    // The router only refreshes after a successful import.
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("passes the configured git host to the source picker so a project link can be pasted", async () => {
    mountWithImportRemoteZip(vi.fn().mockResolvedValue({}));

    expect(
      document.querySelector('[data-testid="picker-host"]')?.textContent,
    ).toBe("https://gitea.example.org");
  });
});
