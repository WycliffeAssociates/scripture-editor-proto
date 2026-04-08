// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateProject } from "@/app/routes/create.tsx";

const useRouterMock = vi.fn();

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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => {
        root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    document.body.innerHTML = "";
    useRouterMock.mockReset();
});

function render(ui: React.ReactNode) {
    act(() => {
        root?.render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);
    });
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

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(listWritableRemoteRepos).toHaveBeenCalledWith({
            page: 1,
            pageSize: 20,
            topic: "consolidated",
        });
        expect(document.body.textContent).toContain("Choose a source");
        expect(document.body.textContent).toContain("bho-bible");

        const addButtons = [
            ...document.querySelectorAll("button"),
        ].filter((button) => button.textContent?.includes("Get copy"));
        await act(async () => {
            addButtons[0]?.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
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
                    cloneUrl:
                        "https://gitea.example.org/alice/bho-bible.git",
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
                    cloneUrl:
                        "https://gitea.example.org/someone/not-owned.git",
                    defaultBranch: "master",
                    topics: ["consolidated"],
                    canWrite: true,
                },
            ],
            nextPage: null,
        });
        const listOwnedRemoteRepos = vi.fn().mockResolvedValue({
            repos: [
                {
                    id: "1",
                    owner: "alice",
                    name: "bho-bible",
                    fullName: "alice/bho-bible",
                    htmlUrl: "https://gitea.example.org/alice/bho-bible",
                    cloneUrl:
                        "https://gitea.example.org/alice/bho-bible.git",
                    defaultBranch: "master",
                    topics: ["consolidated"],
                    canWrite: true,
                },
            ],
            nextPage: null,
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

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(listWritableRemoteRepos).toHaveBeenCalledWith({
            page: 1,
            pageSize: 20,
            topic: "consolidated",
        });

        const ownedToggle = document.querySelector<HTMLInputElement>(
            'input[type="checkbox"]',
        );
        expect(ownedToggle).toBeTruthy();

        await act(async () => {
            ownedToggle?.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(listOwnedRemoteRepos).toHaveBeenCalledWith({
            page: 1,
            pageSize: 20,
            topic: "consolidated",
        });
        expect(document.body.textContent).toContain("bho-bible");
        expect(document.body.textContent).not.toContain("not-owned");
    });

    it("logs out the cloud session and resets the repo list when log out is pressed", async () => {
        const logoutCurrentSession = vi.fn().mockResolvedValue(undefined);
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
                        getCurrentSession: vi.fn().mockResolvedValue({
                            username: "alice",
                            hostBaseUrl: "https://gitea.example.org",
                            token: "secret-token",
                            tokenId: "1",
                            tokenName: "dovetail-web",
                        }),
                        loginWithPassword: vi.fn(),
                        logoutCurrentSession,
                        clearSession: vi.fn(),
                    },
                },
            },
        });

        render(<CreateProject />);

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        const disconnectButton = [
            ...document.querySelectorAll("button"),
        ].find((button) => button.textContent?.includes("Log out"));
        expect(disconnectButton).toBeTruthy();

        await act(async () => {
            disconnectButton?.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
            await Promise.resolve();
        });

        expect(logoutCurrentSession).toHaveBeenCalledTimes(1);
        expect(document.body.textContent).toContain(
            "Search a language, title, owner, or repo name to see projects.",
        );
        expect(document.body.textContent).not.toContain("bho-bible");
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

        const remoteToggle = [...document.querySelectorAll("button")].find(
            (button) => button.textContent?.includes("Remote"),
        );
        expect(remoteToggle).toBeTruthy();

        await act(async () => {
            remoteToggle?.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
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
            usernameInput!.value = "alice";
            usernameInput!.dispatchEvent(
                new Event("input", { bubbles: true }),
            );
            usernameInput!.dispatchEvent(
                new Event("change", { bubbles: true }),
            );
            passwordInput!.value = "secret";
            passwordInput!.dispatchEvent(
                new Event("input", { bubbles: true }),
            );
            passwordInput!.dispatchEvent(
                new Event("change", { bubbles: true }),
            );
            await Promise.resolve();
        });

        const connectButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent?.includes("Connect account"),
        );
        expect(connectButton).toBeTruthy();

        await act(async () => {
            connectButton?.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(loginWithPassword).toHaveBeenCalledWith({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            password: "secret",
            otp: null,
        });
        expect(listWritableRemoteRepos).toHaveBeenCalledWith({
            page: 1,
            pageSize: 20,
            topic: "consolidated",
        });
    });
});
