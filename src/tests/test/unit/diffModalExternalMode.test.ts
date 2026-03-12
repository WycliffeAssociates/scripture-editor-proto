// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { MantineProvider } from "@mantine/core";
import type { SerializedLexicalNode } from "lexical";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import type {
    ChapterRenderToken,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import { ChapterDiffStructuredDocument } from "@/app/ui/components/blocks/DiffModal/DiffModalChapterView.tsx";
import { VirtualizedDiffList } from "@/app/ui/components/blocks/DiffModal/DiffModalListView.tsx";
import { DiffViewerModal } from "@/app/ui/components/blocks/DiffModal/DiffViewerModal.tsx";
import { ThemeQueryProvider } from "@/app/ui/contexts/MediaQuery.tsx";
import {
    type WorkSpaceContextType,
    WorkspaceContext,
} from "@/app/ui/contexts/WorkspaceContext.tsx";

vi.mock("@tanstack/react-virtual", () => ({
    useVirtualizer: ({ count }: { count: number }) => ({
        getTotalSize: () => count * 200,
        getVirtualItems: () =>
            Array.from({ length: count }, (_, index) => ({
                index,
                start: index * 200,
                size: 200,
                key: index,
            })),
        measureElement: () => 200,
    }),
}));

function makeTextToken(args: {
    text: string;
    sid?: string;
    id?: string;
}): ChapterRenderToken {
    return {
        sid: args.sid ?? "GEN 1:1",
        tokenType: UsfmTokenTypes.text,
        node: {
            type: "usfm-text-node",
            lexicalType: "usfm-text-node",
            version: 1,
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            id: args.id ?? "tok-1",
            sid: args.sid ?? "GEN 1:1",
            tokenType: UsfmTokenTypes.text,
            text: args.text,
        } as unknown as SerializedLexicalNode,
    };
}

function makeDiff(overrides: Partial<ProjectDiff> = {}): ProjectDiff {
    return {
        uniqueKey: "diff-1",
        semanticSid: "GEN 1:1",
        status: "modified",
        originalDisplayText: "alpha",
        currentDisplayText: "beta",
        originalTextOnly: "alpha",
        currentTextOnly: "beta",
        bookCode: "GEN",
        chapterNum: 1,
        originalRenderTokens: [makeTextToken({ text: "alpha", id: "orig-1" })],
        currentRenderTokens: [makeTextToken({ text: "beta", id: "curr-1" })],
        originalAlignment: [{ change: "modified", counterpartIndex: 0 }],
        currentAlignment: [{ change: "modified", counterpartIndex: 0 }],
        undoSide: "current",
        ...overrides,
    };
}

function makeWorkspaceValue(): WorkSpaceContextType {
    return {
        actions: {
            switchBookOrChapter: vi.fn(),
            toggleDiffModal: vi.fn(),
        },
        bookCodeToProjectLocalizedTitle: ({
            bookCode,
            replaceCodeInString,
        }: {
            bookCode: string;
            replaceCodeInString?: string;
        }) => replaceCodeInString ?? bookCode,
    } as unknown as WorkSpaceContextType;
}

function TestProviders(props: { children: React.ReactNode }) {
    return React.createElement(
        MantineProvider,
        null,
        React.createElement(
            I18nProvider,
            { i18n },
            React.createElement(
                ThemeQueryProvider,
                null,
                React.createElement(
                    WorkspaceContext.Provider,
                    { value: makeWorkspaceValue() },
                    props.children,
                ),
            ),
        ),
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
    globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
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
        root?.render(React.createElement(TestProviders, null, ui));
    });
}

describe("diff modal external compare UI", () => {
    it("renders apply controls and comparison labels in list view", () => {
        render(
            React.createElement(VirtualizedDiffList, {
                diffs: [makeDiff()],
                actionMode: "external",
                onRevertDiff: vi.fn(),
                onApplyDiffToCurrent: vi.fn(),
                originalLabel: "Your current",
                currentLabel: "Comparison",
                showUsfmMarkers: false,
                isOpen: true,
            }),
        );

        expect(document.body.textContent).toContain("Your current");
        expect(document.body.textContent).toContain("Comparison");
        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.save.applyButton}"]`,
            ),
        ).not.toBeNull();
        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.save.revertButton}"]`,
            ),
        ).toBeNull();
    });

    it("renders chapter apply controls on the comparison side only", () => {
        render(
            React.createElement(ChapterDiffStructuredDocument, {
                diffs: [makeDiff()],
                actionMode: "external",
                hideWhitespaceOnly: false,
                showUsfmMarkers: false,
                chapterLabel: "Genesis 1",
                onRevertDiff: vi.fn(),
                onApplyDiffToCurrent: vi.fn(),
                onChapterAction: vi.fn(),
                originalLabel: "Your current",
                currentLabel: "Comparison",
            }),
        );

        expect(document.body.textContent).toContain("Apply chapter to current");
        const actionButtons = document.querySelectorAll(
            `[data-testid="${TESTING_IDS.save.chapterHunkAction}"]`,
        );
        expect(document.body.textContent).toContain("Your current");
        expect(document.body.textContent).toContain("Comparison");
        expect(actionButtons).toHaveLength(1);
    });

    it("hides external baseline controls and uses your-current summary text", () => {
        render(
            React.createElement(DiffViewerModal, {
                isOpen: true,
                onClose: vi.fn(),
                diffs: [makeDiff()],
                diffsByChapter: { GEN: { 1: [makeDiff()] } },
                isCalculating: false,
                actionMode: "external",
                onRevertDiff: vi.fn(),
                onRevertChapter: vi.fn(),
                onApplyDiffToCurrent: vi.fn(),
                onApplyChapterToCurrent: vi.fn(),
                saveAllChanges: vi.fn(),
                revertAllChanges: vi.fn(),
                compareMode: "external",
                setCompareMode: vi.fn(),
                compareSourceKind: "previousVersion",
                setCompareSourceKind: vi.fn(),
                compareSourceProjectId: "",
                setCompareSourceProjectId: vi.fn(),
                compareSourceVersionHash: "abc1234",
                setCompareSourceVersionHash: vi.fn(),
                compareProjects: [],
                compareVersionOptions: [
                    { value: "abc1234", label: "Mar 11, 2026, 9:00 AM" },
                ],
                loadCompareProject: vi.fn(async () => {}),
                loadCompareZip: vi.fn(async () => {}),
                loadCompareDirectory: vi.fn(async () => {}),
                loadCompareVersion: vi.fn(async () => {}),
                compareWarnings: [],
                takeIncomingAll: vi.fn(),
                hasComputedCompare: true,
                resetExternalCompare: vi.fn(),
                isSm: false,
                isXs: false,
            }),
        );

        expect(document.body.textContent).toContain(
            "Comparing your current vs Mar 11, 2026, 9:00 AM",
        );
        expect(document.body.textContent).not.toContain("Current saved");
        expect(document.body.textContent).not.toContain("Current dirty");
    });
});
