// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudProjectImporter } from "@/app/ui/components/import/CloudProjectImporter.tsx";

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

describe("CloudProjectImporter", () => {
    it("shows an account-required empty state when no cloud session is present", () => {
        render(
            <CloudProjectImporter
                sessionUsername={null}
                repos={[]}
                isLoading={false}
                isImporting={false}
                isDisconnecting={false}
                error={null}
                hasLoaded={false}
                hasNextPage={false}
                onRefresh={vi.fn()}
                onDisconnect={vi.fn()}
                onLoadMore={vi.fn()}
                onCloneRepo={vi.fn()}
            />,
        );

        expect(document.body.textContent).toContain(
            "No cloud account is connected on this device yet.",
        );
    });

    it("renders cloud repos and calls clone when the add button is pressed", () => {
        const onCloneRepo = vi.fn();
        render(
            <CloudProjectImporter
                sessionUsername="alice"
                repos={[
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
                ]}
                isLoading={false}
                isImporting={false}
                isDisconnecting={false}
                error={null}
                hasLoaded={true}
                hasNextPage={true}
                onRefresh={vi.fn()}
                onDisconnect={vi.fn()}
                onLoadMore={vi.fn()}
                onCloneRepo={onCloneRepo}
            />,
        );

        expect(document.body.textContent).toContain("Connected as alice");
        expect(document.body.textContent).toContain("bho-bible");
        expect(document.body.textContent).toContain("Load more");

        const addButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent?.includes("Add"),
        );
        expect(addButton).toBeTruthy();

        act(() => {
            addButton?.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
        });

        expect(onCloneRepo).toHaveBeenCalledWith(
            expect.objectContaining({ name: "bho-bible" }),
        );
    });

    it("renders a disconnect action for a connected session", () => {
        const onDisconnect = vi.fn();
        render(
            <CloudProjectImporter
                sessionUsername="alice"
                repos={[]}
                isLoading={false}
                isImporting={false}
                isDisconnecting={false}
                error={null}
                hasLoaded={true}
                hasNextPage={false}
                onRefresh={vi.fn()}
                onDisconnect={onDisconnect}
                onLoadMore={vi.fn()}
                onCloneRepo={vi.fn()}
            />,
        );

        const disconnectButton = [
            ...document.querySelectorAll("button"),
        ].find((button) => button.textContent?.includes("Disconnect"));
        expect(disconnectButton).toBeTruthy();

        act(() => {
            disconnectButton?.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
        });

        expect(onDisconnect).toHaveBeenCalledTimes(1);
    });
});
