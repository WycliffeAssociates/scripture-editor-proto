// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { MantineProvider } from "@mantine/core";
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
        root?.render(
            <MantineProvider>
                <I18nProvider i18n={i18n}>{ui}</I18nProvider>
            </MantineProvider>,
        );
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
                        cloneWritableRemoteProject,
                    },
                    authSessionProvider: {
                        getCurrentSession: vi.fn().mockResolvedValue({
                            username: "alice",
                            hostBaseUrl: "https://gitea.example.org",
                            token: "secret-token",
                            tokenId: "1",
                            tokenName: "dovetail-web",
                        }),
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
        expect(document.body.textContent).toContain("From my cloud projects");
        expect(document.body.textContent).toContain("bho-bible");

        const addButtons = [
            ...document.querySelectorAll("button"),
        ].filter((button) => button.textContent?.includes("Add"));
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

    it("clears the local cloud session and resets the repo list when disconnect is pressed", async () => {
        const clearSession = vi.fn().mockResolvedValue(undefined);
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
                        cloneWritableRemoteProject: vi.fn(),
                    },
                    authSessionProvider: {
                        getCurrentSession: vi.fn().mockResolvedValue({
                            username: "alice",
                            hostBaseUrl: "https://gitea.example.org",
                            token: "secret-token",
                            tokenId: "1",
                            tokenName: "dovetail-web",
                        }),
                        clearSession,
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
        ].find((button) => button.textContent?.includes("Disconnect"));
        expect(disconnectButton).toBeTruthy();

        await act(async () => {
            disconnectButton?.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
            await Promise.resolve();
        });

        expect(clearSession).toHaveBeenCalledTimes(1);
        expect(document.body.textContent).toContain(
            "No cloud account is connected on this device yet.",
        );
        expect(document.body.textContent).not.toContain("bho-bible");
    });
});
