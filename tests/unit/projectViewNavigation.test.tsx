// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { ProjectView } from "@/app/ui/components/views/ProjectView.tsx";

const useWorkspaceContextMock = vi.fn();

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

vi.mock("@/app/ui/components/blocks/AppDrawer.tsx", () => ({
    AppDrawer: () => null,
}));

vi.mock("@/app/ui/components/blocks/Editor.tsx", () => ({
    MainEditor: () => <div data-testid={TESTING_IDS.mainEditorContainer} />,
}));

vi.mock("@/app/ui/components/blocks/ReferenceEditor.tsx", () => ({
    ReferenceEditor: () => <div data-testid="reference-editor" />,
}));

vi.mock("@/app/ui/components/blocks/Search.tsx", () => ({
    SearchPanel: () => null,
}));

vi.mock("@/app/ui/components/blocks/Toolbar.tsx", () => ({
    Toolbar: () => <div data-testid="toolbar" />,
}));

function TestProviders(props: { children: React.ReactNode }) {
    return (
        <MantineProvider>
            <I18nProvider i18n={i18n}>{props.children}</I18nProvider>
        </MantineProvider>
    );
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
        referenceResource: { activeReferenceResourcePath: null },
        search: {
            isSearchPaneOpen: false,
            rerunForCurrentChapter: vi.fn(),
        },
        actions: {
            prevChapter: {
                hasPrev: false,
                display: "",
                go: vi.fn(),
            },
            nextChapter: {
                hasNext: true,
                display: "2",
                go: vi.fn(),
            },
        },
        project: {
            currentChapter: 1,
            pickedChapter: { chapterNumber: 1 },
            pickedFile: { bookCode: "GEN" },
        },
        bookCodeToProjectLocalizedTitle: () => "Genesis",
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

describe("ProjectView navigation", () => {
    it("renders the hidden prev-button placeholder at the first chapter boundary", () => {
        render(<ProjectView />);

        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.navigation.prevChapterButtonHidden}"]`,
            ),
        ).not.toBeNull();
        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.navigation.prevChapterButton}"]`,
            ),
        ).toBeNull();
        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.navigation.nextChapterButton}"]`,
            ),
        ).not.toBeNull();
    });

    it("renders the hidden next-button placeholder at the last chapter boundary", () => {
        useWorkspaceContextMock.mockReturnValue({
            referenceResource: { activeReferenceResourcePath: null },
            search: {
                isSearchPaneOpen: false,
                rerunForCurrentChapter: vi.fn(),
            },
            actions: {
                prevChapter: {
                    hasPrev: true,
                    display: "21",
                    go: vi.fn(),
                },
                nextChapter: {
                    hasNext: false,
                    display: "",
                    go: vi.fn(),
                },
            },
            project: {
                currentChapter: 22,
                pickedChapter: { chapterNumber: 22 },
                pickedFile: { bookCode: "REV" },
            },
            bookCodeToProjectLocalizedTitle: () => "Revelation",
        });

        render(<ProjectView />);

        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.navigation.nextChapterButtonHidden}"]`,
            ),
        ).not.toBeNull();
        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.navigation.nextChapterButton}"]`,
            ),
        ).toBeNull();
        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.navigation.prevChapterButton}"]`,
            ),
        ).not.toBeNull();
    });

    it("shows the previous book label when the current chapter is the first chapter of a non-first book", () => {
        useWorkspaceContextMock.mockReturnValue({
            referenceResource: { activeReferenceResourcePath: null },
            search: {
                isSearchPaneOpen: false,
                rerunForCurrentChapter: vi.fn(),
            },
            actions: {
                prevChapter: {
                    hasPrev: true,
                    display: "Malachi 4",
                    go: vi.fn(),
                },
                nextChapter: {
                    hasNext: true,
                    display: "2",
                    go: vi.fn(),
                },
            },
            project: {
                currentChapter: 1,
                pickedChapter: { chapterNumber: 1 },
                pickedFile: { bookCode: "MAT" },
            },
            bookCodeToProjectLocalizedTitle: () => "Matthew",
        });

        render(<ProjectView />);

        const prevButton = document.querySelector(
            `[data-testid="${TESTING_IDS.navigation.prevChapterButton}"]`,
        );
        expect(prevButton?.textContent).toContain("Malachi 4");
    });

    it("renders one navigation affordance in each direction at a boundary", () => {
        render(<ProjectView />);

        const prevAffordanceCount = document.querySelectorAll(
            [
                `[data-testid="${TESTING_IDS.navigation.prevChapterButton}"]`,
                `[data-testid="${TESTING_IDS.navigation.prevChapterButtonHidden}"]`,
            ].join(", "),
        ).length;
        const nextAffordanceCount = document.querySelectorAll(
            [
                `[data-testid="${TESTING_IDS.navigation.nextChapterButton}"]`,
                `[data-testid="${TESTING_IDS.navigation.nextChapterButtonHidden}"]`,
            ].join(", "),
        ).length;

        expect(prevAffordanceCount).toBe(1);
        expect(nextAffordanceCount).toBe(1);
    });
});
