// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { ReferenceResourceList } from "@/app/ui/components/blocks/Toolbar.tsx";
import type { ResourceLibraryItem } from "@/core/library/ProjectIndex.ts";

const useWorkspaceContextMock = vi.fn();
const useWorkspaceMediaQueryMock = vi.fn();

vi.mock("@/app/ui/hooks/useWorkspaceContext.tsx", () => ({
    useWorkspaceContext: () => useWorkspaceContextMock(),
}));

vi.mock("@/app/ui/contexts/MediaQuery.tsx", () => ({
    useWorkspaceMediaQuery: () => useWorkspaceMediaQueryMock(),
}));

vi.mock("@mantine/core", async () => {
    const actual = await vi.importActual<typeof import("@mantine/core")>(
        "@mantine/core",
    );

    const MockMenuRoot = (props: {
        children: React.ReactNode;
        classNames?: unknown;
        [key: string]: unknown;
    }) => {
        const { classNames: _classNames, ...domProps } = props;
        return <div {...domProps}>{props.children}</div>;
    };
    const MockMenuTarget = (props: { children: React.ReactNode }) => (
        <>{props.children}</>
    );
    const MockMenuDropdown = (props: {
        children: React.ReactNode;
        classNames?: unknown;
        [key: string]: unknown;
    }) => {
        const { classNames: _classNames, ...domProps } = props;
        return <div {...domProps}>{props.children}</div>;
    };
    const MockMenuItem = (props: React.ComponentProps<"button">) => (
        <button type="button" {...props}>
            {props.children}
        </button>
    );
    const MockMenuLabel = (props: React.ComponentProps<"div">) => (
        <div {...props}>{props.children}</div>
    );

    const MockMenu = Object.assign(MockMenuRoot, {
        Target: MockMenuTarget,
        Dropdown: MockMenuDropdown,
        Item: MockMenuItem,
        Label: MockMenuLabel,
    });

    return {
        ...actual,
        Menu: MockMenu,
    };
});

function makeReferenceResource(
    overrides: Partial<ResourceLibraryItem> = {},
): ResourceLibraryItem {
    return {
        folderName: "en_ulb",
        projectPath: "/userData/projects/en_ulb",
        displayName: "English ULB",
        projectId: "en_ulb",
        languageCode: "en",
        languageName: "English",
        projectType: "resource-container",
        type: "usfmScripture",
        containerFormat: "resource-container",
        isEditable: true,
        hasRemoteSync: false,
        libraryGroup: "scripture",
        ...overrides,
    };
}

function TestProviders(props: { children: React.ReactNode }) {
    return (
        <MantineProvider>
            <I18nProvider i18n={i18n}>{props.children}</I18nProvider>
        </MantineProvider>
    );
}

function click(element: Element | null) {
    if (!element) throw new Error("Expected element to exist");
    act(() => {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
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

    if (!("ResizeObserver" in globalThis)) {
        Object.defineProperty(globalThis, "ResizeObserver", {
            writable: true,
            value: class ResizeObserver {
                observe() {}
                unobserve() {}
                disconnect() {}
            },
        });
    }
});

beforeEach(() => {
    useWorkspaceMediaQueryMock.mockReturnValue({
        isSm: false,
        setMobileTab: vi.fn(),
    });
});

afterEach(() => {
    useWorkspaceContextMock.mockReset();
    useWorkspaceMediaQueryMock.mockReset();
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

describe("ReferenceResourceList", () => {
    it("groups broader reference resources by type and language", () => {
        useWorkspaceContextMock.mockReturnValue({
            currentProjectRoute: "current-project",
            referenceResource: {
                activeReferenceResourcePath: undefined,
                setActiveReferenceResourcePath: vi.fn(),
                referenceResourcesQuery: {
                    data: [
                        makeReferenceResource(),
                        makeReferenceResource({
                            folderName: "en_tn",
                            projectPath: "/userData/resources/en_tn",
                            displayName: "English Translation Notes",
                            projectId: "en_tn",
                            type: "translationNotes",
                            isEditable: false,
                            hasRemoteSync: false,
                            libraryGroup: "translation-notes",
                        }),
                        makeReferenceResource({
                            folderName: "es_tw",
                            projectPath: "/userData/resources/es_tw",
                            displayName: "Spanish Translation Words",
                            projectId: "es_tw",
                            languageCode: "es",
                            languageName: "Spanish",
                            type: "translationWords",
                            isEditable: false,
                            hasRemoteSync: false,
                            libraryGroup: "translation-words",
                        }),
                    ],
                },
            },
        });

        render(<ReferenceResourceList />);

        expect(document.body.textContent).toContain("Scripture");
        expect(document.body.textContent).toContain("Translation Notes");
        expect(document.body.textContent).toContain("Translation Words");
        expect(document.body.textContent).toContain("English");
        expect(document.body.textContent).toContain("Spanish");
        expect(document.body.textContent).toContain("English Translation Notes");
        expect(document.body.textContent).toContain("Spanish Translation Words");
    });

    it("keeps a single active reference resource and selects a grouped resource", () => {
        const setActiveReferenceResourcePath = vi.fn();

        useWorkspaceContextMock.mockReturnValue({
            currentProjectRoute: "current-project",
            referenceResource: {
                activeReferenceResourcePath: "/userData/resources/en_tn",
                setActiveReferenceResourcePath,
                referenceResourcesQuery: {
                    data: [
                        makeReferenceResource({
                            folderName: "current-project",
                            projectPath: "/userData/projects/current-project",
                            displayName: "Current Project",
                            projectId: "current-project",
                        }),
                        makeReferenceResource({
                            folderName: "en_tn",
                            projectPath: "/userData/resources/en_tn",
                            displayName: "English Translation Notes",
                            projectId: "en_tn",
                            type: "translationNotes",
                            isEditable: false,
                            hasRemoteSync: false,
                            libraryGroup: "translation-notes",
                        }),
                        makeReferenceResource({
                            folderName: "en_tw",
                            projectPath: "/userData/resources/en_tw",
                            displayName: "English Translation Words",
                            projectId: "en_tw",
                            type: "translationWords",
                            isEditable: false,
                            hasRemoteSync: false,
                            libraryGroup: "translation-words",
                        }),
                    ],
                },
            },
        });

        render(<ReferenceResourceList />);

        expect(document.body.textContent).toContain("English Translation Notes");

        const items = [
            ...document.querySelectorAll(
                `[data-testid="${TESTING_IDS.referenceProjectItem}"]`,
            ),
        ];
        const translationWordsItem = items.find((element) =>
            element.textContent?.includes("English Translation Words"),
        );

        click(translationWordsItem ?? null);

        expect(setActiveReferenceResourcePath).toHaveBeenCalledWith(
            "/userData/resources/en_tw",
        );
        expect(setActiveReferenceResourcePath).toHaveBeenCalledTimes(1);
    });
});
