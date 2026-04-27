// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateProject } from "@/app/routes/create.tsx";

const useRouterMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
  useRouter: () => useRouterMock(),
}));

vi.mock("@/app/ui/i18n/loadLocale.tsx", () => ({
  loadLocale: vi.fn(async () => {}),
}));

vi.mock("@/app/ui/components/blocks/ProjectSettings/Settings.tsx", () => ({
  LanguageSelector: (props: { value: string | null; onChange: (value: string | null) => void }) => (
    <button type="button" onClick={() => props.onChange(props.value)}>
      language
    </button>
  ),
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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
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

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function selectLinkedCloudAndSearch(term: string) {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (
      [...document.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("Log out"),
      )
    ) {
      break;
    }
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  const linkedCloudButton = [...document.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Linked cloud"),
  );
  expect(linkedCloudButton).toBeTruthy();

  await act(async () => {
    linkedCloudButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const searchInput = document.querySelector(
    'input[aria-label="Search projects"]',
  ) as HTMLInputElement | null;
  expect(searchInput).toBeTruthy();

  await act(async () => {
    setInputValue(searchInput!, term);
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waitForButtonText(text: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const button = [...document.querySelectorAll("button")].find((node) =>
      node.textContent?.includes(text),
    );
    if (button) {
      return button as HTMLButtonElement;
    }
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
  return null;
}

describe("CreateProject cloud import", () => {
  it("loads writable cloud repos for the current session and clones the selected repo", async () => {
    const listWritableRemoteRepos = vi.fn().mockResolvedValue({
      repos: [
        {
          id: "1",
          owner: "alice",
          name: "bho-bible",
          fullName: "alice/bho-bible",
          htmlUrl: "https://gitea.example.org/alice/bho-bible",
          cloneUrl: "https://gitea.example.org/alice/bho-bible.git",
          defaultBranch: "master",
          topics: ["consolidated"],
          canWrite: true,
        },
      ],
      nextPage: null,
      rawResultCount: 1,
    });
    const cloneWritableRemoteProject = vi.fn().mockResolvedValue({
      project: {
        projectPath: "/userData/projects/bho-bible",
      },
      isEditableProject: true,
      gitReady: true,
    });
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
          importService: {},
          projectsService: {
            listWritableRemoteRepos,
            listOwnedRemoteRepos: vi.fn(),
            cloneWritableRemoteProject,
          },
          giteaHostBaseUrl: "https://gitea.example.org",
          authSessionProvider: {
            getCurrentSession: vi.fn().mockResolvedValue({
              username: "alice",
              hostBaseUrl: "https://gitea.example.org",
              token: "secret-token",
              tokenId: "1",
              tokenName: "dovetail-web",
            }),
            loginWithPassword: vi.fn(),
            logoutCurrentSession: vi.fn(),
          },
        },
      },
    });

    render(<CreateProject />);
    await selectLinkedCloudAndSearch("bho");

    expect(listWritableRemoteRepos).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 100,
        topic: "consolidated",
        searchQuery: "bho",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(document.body.textContent).toContain("Choose a source");
    const importLinkedCopyButton = await waitForButtonText("Import linked copy");
    expect(importLinkedCopyButton).toBeTruthy();
    await act(async () => {
      importLinkedCopyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(cloneWritableRemoteProject).toHaveBeenCalledWith({
      repo: expect.objectContaining({
        name: "bho-bible",
      }),
    });
    expect(invalidate).toHaveBeenCalled();
  });

  it("loads owned repos from Gitea when the owned-only checkbox is checked", async () => {
    const listWritableRemoteRepos = vi.fn().mockResolvedValue({
      repos: [
        {
          id: "1",
          owner: "alice",
          name: "bho-bible",
          fullName: "alice/bho-bible",
          htmlUrl: "https://gitea.example.org/alice/bho-bible",
          cloneUrl: "https://gitea.example.org/alice/bho-bible.git",
          defaultBranch: "master",
          topics: ["consolidated"],
          canWrite: true,
        },
        {
          id: "2",
          owner: "someone",
          name: "not-owned",
          fullName: "someone/not-owned",
          htmlUrl: "https://gitea.example.org/someone/not-owned",
          cloneUrl: "https://gitea.example.org/someone/not-owned.git",
          defaultBranch: "master",
          topics: ["consolidated"],
          canWrite: true,
        },
      ],
      nextPage: null,
      rawResultCount: 2,
    });
    const listOwnedRemoteRepos = vi.fn().mockResolvedValue({
      repos: [
        {
          id: "1",
          owner: "alice",
          name: "bho-bible",
          fullName: "alice/bho-bible",
          htmlUrl: "https://gitea.example.org/alice/bho-bible",
          cloneUrl: "https://gitea.example.org/alice/bho-bible.git",
          defaultBranch: "master",
          topics: ["consolidated"],
          canWrite: true,
        },
      ],
      nextPage: null,
      rawResultCount: 1,
    });

    useRouterMock.mockReturnValue({
      invalidate: vi.fn(async () => {}),
      navigate: vi.fn(),
      options: {
        context: {
          settingsManager: {
            get: vi.fn().mockReturnValue("en"),
            set: vi.fn(),
            applySettings: vi.fn(),
            update: vi.fn(),
          },
          importService: {},
          projectsService: {
            listWritableRemoteRepos,
            listOwnedRemoteRepos,
            cloneWritableRemoteProject: vi.fn(),
          },
          giteaHostBaseUrl: "https://gitea.example.org",
          authSessionProvider: {
            getCurrentSession: vi.fn().mockResolvedValue({
              username: "alice",
              hostBaseUrl: "https://gitea.example.org",
              token: "secret-token",
              tokenId: "1",
              tokenName: "dovetail-web",
            }),
            loginWithPassword: vi.fn(),
            logoutCurrentSession: vi.fn(),
          },
        },
      },
    });

    render(<CreateProject />);
    await selectLinkedCloudAndSearch("bho");

    expect(listWritableRemoteRepos).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 100,
        topic: "consolidated",
        searchQuery: "bho",
        signal: expect.any(AbortSignal),
      }),
    );

    const ownedToggle = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(ownedToggle).toBeTruthy();

    await act(async () => {
      ownedToggle?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listOwnedRemoteRepos).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 100,
        topic: "consolidated",
        searchQuery: "bho",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("creates a cloud session from the login form when a host is configured", async () => {
    const loginWithPassword = vi.fn().mockResolvedValue({
      username: "alice",
      hostBaseUrl: "https://gitea.example.org",
      token: "created-token",
      tokenId: "7",
      tokenName: "dovetail-7",
    });
    const listWritableRemoteRepos = vi.fn().mockResolvedValue({
      repos: [],
      nextPage: null,
      rawResultCount: 0,
    });

    useRouterMock.mockReturnValue({
      invalidate: vi.fn(async () => {}),
      navigate: vi.fn(),
      options: {
        context: {
          settingsManager: {
            get: vi.fn().mockReturnValue("en"),
            set: vi.fn(),
            applySettings: vi.fn(),
            update: vi.fn(),
          },
          importService: {},
          projectsService: {
            listWritableRemoteRepos,
            listOwnedRemoteRepos: vi.fn(),
            cloneWritableRemoteProject: vi.fn(),
          },
          giteaHostBaseUrl: "https://gitea.example.org",
          authSessionProvider: {
            getCurrentSession: vi.fn().mockResolvedValue(null),
            loginWithPassword,
            logoutCurrentSession: vi.fn(),
            clearSession: vi.fn(),
          },
        },
      },
    });

    render(<CreateProject />);

    const linkedCloudToggle = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Linked cloud"),
    );
    expect(linkedCloudToggle).toBeTruthy();

    await act(async () => {
      linkedCloudToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const usernameInput = document.querySelector(
      'input[aria-label="Remote username"]',
    ) as HTMLInputElement | null;
    const passwordInput = document.querySelector(
      'input[aria-label="Remote password"]',
    ) as HTMLInputElement | null;
    expect(usernameInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();

    await act(async () => {
      setInputValue(usernameInput!, "alice");
      setInputValue(passwordInput!, "secret");
      await Promise.resolve();
    });

    const connectButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Connect account"),
    );
    expect(connectButton).toBeTruthy();

    await act(async () => {
      connectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loginWithPassword).toHaveBeenCalledWith({
      hostBaseUrl: "https://gitea.example.org",
      username: "alice",
      password: "secret",
      otp: null,
    });
  });
});
