// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { Popover, PopoverTarget } from "@/app/ui/components/primitives/Popover/Popover.tsx";
import {
    SearchPanel,
    SearchPopoverControls,
} from "@/app/ui/components/views/search-panel/index.ts";

const useWorkspaceContextMock = vi.fn();

vi.mock("@/app/ui/hooks/useWorkspaceContext.tsx", () => ({
    useWorkspaceContext: () => useWorkspaceContextMock(),
}));

vi.mock("@/app/ui/contexts/MediaQuery.tsx", () => ({
    useWorkspaceMediaQuery: () => ({
        isSm: false,
        isDarkTheme: false,
    }),
}));

vi.mock("@tanstack/react-virtual", () => ({
    useVirtualizer: ({ count }: { count: number }) => ({
        getTotalSize: () => count * 72,
        getVirtualItems: () =>
            Array.from({ length: count }, (_, index) => ({
                index,
                start: index * 72,
                size: 72,
                key: index,
            })),
        measureElement: () => 72,
    }),
}));

type SearchResultLike = {
    sid: string;
    sidOccurrenceIndex: number;
    text: string;
    bibleIdentifier: string;
    chapNum: number;
    parsedSid: null;
    isCaseMismatch: boolean;
    naturalIndex: number;
    source: "target" | "reference";
};

function makeResult(
    overrides: Partial<SearchResultLike> = {},
): SearchResultLike {
    return {
        sid: "MAT 1:1",
        sidOccurrenceIndex: 0,
        text: "Jisu text",
        bibleIdentifier: "MAT",
        chapNum: 1,
        parsedSid: null,
        isCaseMismatch: false,
        naturalIndex: 0,
        source: "target",
        ...overrides,
    };
}

function makeSearch(overrides: Record<string, unknown> = {}) {
    return {
        isSearchPaneOpen: true,
        setIsSearchPaneOpen: vi.fn(),
        isSearching: false,
        searchTerm: "jisu",
        onSearchChange: vi.fn(),
        submitSearchNow: vi.fn(),
        replaceTerm: "",
        setReplaceTerm: vi.fn(),
        results: [],
        targetResults: [],
        referenceResults: [],
        pickedResult: null,
        pickedResultIdx: -1,
        pickSearchResult: vi.fn(),
        nextMatch: vi.fn(),
        prevMatch: vi.fn(),
        replaceCurrentMatch: vi.fn(),
        replaceAllInChapter: vi.fn(),
        replaceMatch: vi.fn(),
        rerunForCurrentChapter: vi.fn(),
        currentMatches: [],
        currentMatchIndex: -1,
        totalMatches: 0,
        numCaseMismatches: 0,
        hasNext: false,
        hasPrev: false,
        matchWholeWord: false,
        setMatchWholeWord: vi.fn(),
        matchCase: false,
        setMatchCase: vi.fn(),
        searchUSFM: false,
        setSearchUSFM: vi.fn(),
        hasReferenceSearchAvailable: false,
        searchReference: false,
        setSearchReference: vi.fn(),
        setSearchReferenceImmediate: vi.fn(),
        sortBy: vi.fn(),
        currentSort: "canonical",
        escapeRegex: (value: string) => value,
        runSearchLogic: vi.fn(),
        replaceSearchResult: vi.fn(),
        ...overrides,
    };
}

function makeWorkspaceValue(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        search: makeSearch(),
        allProjects: [
            {
                folderName: "llx_reg",
                projectPath: "/userData/projects/llx_reg",
                displayName: "Current Project",
                projectId: "llx_reg",
                languageCode: "llx",
                languageName: "Likoon",
            },
            {
                folderName: "en_ulb",
                projectPath: "/userData/projects/en_ulb",
                displayName: "Unlocked Literal Bible",
                projectId: "en_ulb",
                languageCode: "en",
                languageName: "English",
            },
        ],
        currentProjectRoute: "llx_reg",
        referenceResource: {
            activeReferenceResourcePath: "/userData/projects/en_ulb",
            activeReferenceResourceDisplayName: "Unlocked Literal Bible",
            activeReferenceResourceQuery: {
                isLoading: false,
            },
            referenceScriptureQuery: {
                isLoading: false,
            },
            referenceResourcesQuery: {
                data: [
                    {
                        projectPath: "/userData/projects/en_ulb",
                        displayName: "Unlocked Literal Bible",
                        type: "usfmScripture",
                        isEditable: true,
                    },
                ],
            },
            selectActiveReferenceResourcePath: vi.fn(),
        },
        project: {
            pickedFile: { bookCode: "MAT" },
            pickedChapter: { chapterNumber: 1, chapterNumberLabel: "1" },
            currentChapter: 1,
        },
        bookCodeToProjectLocalizedTitle: ({
            bookCode,
        }: {
            bookCode: string;
        }) => bookCode,
        ...overrides,
    };
}

function TestProviders(props: { children: React.ReactNode }) {
    return <I18nProvider i18n={i18n}>{props.children}</I18nProvider>;
}

function WrappedSearchPopoverControls() {
    return (
        <Popover opened position="bottom">
            <PopoverTarget>
                <button type="button">search</button>
            </PopoverTarget>
            <SearchPopoverControls />
        </Popover>
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

describe("SearchPanel", () => {
    it("shows the reference-search control even before a reference project is selected", () => {
        render(<WrappedSearchPopoverControls />);
        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.searchReferenceToggle}"]`,
            ),
        ).not.toBeNull();
    });

    it("shows the reference-search control when a reference project is available", () => {
        useWorkspaceContextMock.mockReturnValue(
            makeWorkspaceValue({
                search: makeSearch({ hasReferenceSearchAvailable: true }),
            }),
        );

        render(<WrappedSearchPopoverControls />);
        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.searchReferenceToggle}"]`,
            ),
        ).not.toBeNull();
    });

    it("renders grouped source and target rows when reference search is enabled", () => {
        const sourceResult = makeResult({
            source: "reference",
            sid: "MAT 1:1",
            text: "Source text",
            naturalIndex: 0,
        });
        const targetResult = makeResult({
            source: "target",
            sid: "MAT 1:1",
            text: "Target text",
            naturalIndex: 0,
        });

        useWorkspaceContextMock.mockReturnValue(
            makeWorkspaceValue({
                search: makeSearch({
                    hasReferenceSearchAvailable: true,
                    searchReference: true,
                    searchTerm: "text",
                    results: [sourceResult],
                    referenceResults: [sourceResult],
                    targetResults: [targetResult],
                }),
            }),
        );

        render(<SearchPanel />);

        const resultRow = document.querySelector(
            `[data-testid="${TESTING_IDS.searchResultItem}"]`,
        );
        expect(
            resultRow?.querySelector('[data-search-row-type="grouped"]'),
        ).not.toBeNull();
        expect(
            resultRow?.querySelector('[data-project-label="source"]')
                ?.textContent,
        ).toContain("Unlocked Literal Bible");
        expect(
            resultRow?.querySelector('[data-project-label="target"]')
                ?.textContent,
        ).toContain("Current Project");
    });
});
