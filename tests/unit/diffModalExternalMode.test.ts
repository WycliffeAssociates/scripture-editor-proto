// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { SerializedLexicalNode } from "lexical";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { COMPARE_SOURCE_KIND } from "@/app/domain/project/compare/types.ts";
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

function makeUsfmToken(args: {
    text: string;
    tokenType: string;
    marker?: string;
    sid?: string;
    id?: string;
}): ChapterRenderToken {
    return {
        sid: args.sid ?? "GEN 1:1",
        tokenType: args.tokenType,
        marker: args.marker,
        node: {
            type: "usfm-text-node",
            lexicalType: "usfm-text-node",
            version: 1,
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            id: args.id ?? "tok-generic-1",
            sid: args.sid ?? "GEN 1:1",
            tokenType: args.tokenType,
            marker: args.marker,
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
        project: {
            appSettings: {
                diffViewModeDefault: "list",
            },
        },
        save: {},
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

        expect(document.body.textContent).toContain(
            "Take all changes in this chapter",
        );
        const actionButtons = document.querySelectorAll(
            `[data-testid="${TESTING_IDS.save.chapterHunkAction}"]`,
        );
        expect(document.body.textContent).toContain("Your current");
        expect(document.body.textContent).toContain("Comparison");
        expect(actionButtons).toHaveLength(1);
    });

    it("shows only one chapter hunk action for a diff entry spanning multiple paragraphs", () => {
        const introDiff = makeDiff({
            semanticSid: "GEN 0:0",
            chapterNum: 0,
            originalDisplayText: "\\id GEN ULB\n\\h Genesis\n",
            currentDisplayText: "\\id GEN ULB\n\\h Genesis Revised\n",
            originalRenderTokens: [
                makeUsfmToken({
                    id: "orig-id-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "id",
                    sid: "GEN 0:0",
                    text: "",
                }),
                makeUsfmToken({
                    id: "orig-id-book",
                    tokenType: "bookCode",
                    sid: "GEN 0:0",
                    text: " GEN",
                }),
                makeUsfmToken({
                    id: "orig-id-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 0:0",
                    text: " ULB",
                }),
                {
                    sid: "GEN 0:0",
                    tokenType: UsfmTokenTypes.verticalWhitespace,
                    node: { type: "linebreak" } as unknown as SerializedLexicalNode,
                },
                makeUsfmToken({
                    id: "orig-h-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "h",
                    sid: "GEN 0:0",
                    text: "",
                }),
                makeUsfmToken({
                    id: "orig-h-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 0:0",
                    text: " Genesis",
                }),
            ],
            currentRenderTokens: [
                makeUsfmToken({
                    id: "curr-id-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "id",
                    sid: "GEN 0:0",
                    text: "",
                }),
                makeUsfmToken({
                    id: "curr-id-book",
                    tokenType: "bookCode",
                    sid: "GEN 0:0",
                    text: " GEN",
                }),
                makeUsfmToken({
                    id: "curr-id-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 0:0",
                    text: " ULB",
                }),
                {
                    sid: "GEN 0:0",
                    tokenType: UsfmTokenTypes.verticalWhitespace,
                    node: { type: "linebreak" } as unknown as SerializedLexicalNode,
                },
                makeUsfmToken({
                    id: "curr-h-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "h",
                    sid: "GEN 0:0",
                    text: "",
                }),
                makeUsfmToken({
                    id: "curr-h-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 0:0",
                    text: " Genesis Revised",
                }),
            ],
            originalAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "unchanged", counterpartIndex: 2 },
                { change: "unchanged", counterpartIndex: 3 },
                { change: "unchanged", counterpartIndex: 4 },
                { change: "modified", counterpartIndex: 5 },
            ],
            currentAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "unchanged", counterpartIndex: 2 },
                { change: "unchanged", counterpartIndex: 3 },
                { change: "unchanged", counterpartIndex: 4 },
                { change: "modified", counterpartIndex: 5 },
            ],
        });

        render(
            React.createElement(ChapterDiffStructuredDocument, {
                diffs: [introDiff],
                actionMode: "external",
                hideWhitespaceOnly: false,
                showUsfmMarkers: true,
                chapterLabel: "Genesis 0",
                onRevertDiff: vi.fn(),
                onApplyDiffToCurrent: vi.fn(),
                onChapterAction: vi.fn(),
                originalLabel: "Your current",
                currentLabel: "Comparison",
            }),
        );

        const actionButtons = document.querySelectorAll(
            `[data-testid="${TESTING_IDS.save.chapterHunkAction}"]`,
        );
        expect(actionButtons).toHaveLength(1);
    });

    it("shows explicit USFM markers in chapter mode without tinting the whole paragraph wrapper", () => {
        const usfmDiff = makeDiff({
            originalDisplayText: "\\v 1 In the beginning",
            currentDisplayText: "\\v 1 In the beginning",
            originalRenderTokens: [
                makeUsfmToken({
                    id: "marker-v",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    text: "",
                }),
                makeUsfmToken({
                    id: "number-v",
                    tokenType: UsfmTokenTypes.numberRange,
                    text: " 1",
                }),
                makeUsfmToken({
                    id: "text-v",
                    tokenType: UsfmTokenTypes.text,
                    text: " In the beginning",
                }),
            ],
            currentRenderTokens: [
                makeUsfmToken({
                    id: "marker-v-current",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    text: "",
                }),
                makeUsfmToken({
                    id: "number-v-current",
                    tokenType: UsfmTokenTypes.numberRange,
                    text: " 1",
                }),
                makeUsfmToken({
                    id: "text-v-current",
                    tokenType: UsfmTokenTypes.text,
                    text: " In the beginning",
                }),
            ],
            originalAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "unchanged", counterpartIndex: 2 },
            ],
            currentAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "unchanged", counterpartIndex: 2 },
            ],
        });

        render(
            React.createElement(ChapterDiffStructuredDocument, {
                diffs: [usfmDiff],
                actionMode: "unsaved",
                hideWhitespaceOnly: false,
                showUsfmMarkers: true,
                chapterLabel: "Genesis 1",
                onRevertDiff: vi.fn(),
                onApplyDiffToCurrent: vi.fn(),
                onChapterAction: vi.fn(),
                originalLabel: "Original",
                currentLabel: "Current",
            }),
        );

        expect(document.body.textContent).toContain("\\v");
        expect(
            document.querySelector(".usfm-para-container")?.getAttribute(
                "data-token-type",
            ),
        ).toBeNull();
    });

    it("hides USFM markers in chapter mode when marker visibility is off", () => {
        const usfmDiff = makeDiff({
            originalDisplayText: "\\v 1 In the beginning",
            currentDisplayText: "\\v 1 In the beginning",
            originalRenderTokens: [
                makeUsfmToken({
                    id: "marker-hidden-v",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    text: "\\v",
                }),
                makeUsfmToken({
                    id: "number-hidden-v",
                    tokenType: UsfmTokenTypes.numberRange,
                    text: " 1",
                }),
                makeUsfmToken({
                    id: "text-hidden-v",
                    tokenType: UsfmTokenTypes.text,
                    text: " In the beginning",
                }),
            ],
            currentRenderTokens: [
                makeUsfmToken({
                    id: "marker-hidden-v-current",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    text: "\\v",
                }),
                makeUsfmToken({
                    id: "number-hidden-v-current",
                    tokenType: UsfmTokenTypes.numberRange,
                    text: " 1",
                }),
                makeUsfmToken({
                    id: "text-hidden-v-current",
                    tokenType: UsfmTokenTypes.text,
                    text: " In the beginning",
                }),
            ],
            originalAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "unchanged", counterpartIndex: 2 },
            ],
            currentAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "unchanged", counterpartIndex: 2 },
            ],
        });

        render(
            React.createElement(ChapterDiffStructuredDocument, {
                diffs: [usfmDiff],
                actionMode: "unsaved",
                hideWhitespaceOnly: false,
                showUsfmMarkers: false,
                chapterLabel: "Genesis 1",
                onRevertDiff: vi.fn(),
                onApplyDiffToCurrent: vi.fn(),
                onChapterAction: vi.fn(),
                originalLabel: "Original",
                currentLabel: "Current",
            }),
        );

        expect(document.body.textContent).toContain("1 In the beginning");
        expect(document.body.textContent).not.toContain("\\v");
    });

    it("renders trailing whitespace for modified chapter tokens", () => {
        const whitespaceDiff = makeDiff({
            semanticSid: "GEN 0:0",
            bookCode: "GEN",
            chapterNum: 0,
            isWhitespaceChange: true,
            originalDisplayText: "\\s5\n",
            currentDisplayText: "\\s5 \n",
            originalRenderTokens: [
                makeUsfmToken({
                    id: "orig-s5",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "s5",
                    sid: "GEN 0:0",
                    text: "\\s5",
                }),
            ],
            currentRenderTokens: [
                makeUsfmToken({
                    id: "curr-s5",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "s5",
                    sid: "GEN 0:0",
                    text: "\\s5 ",
                }),
            ],
            originalAlignment: [{ change: "modified", counterpartIndex: 0 }],
            currentAlignment: [{ change: "modified", counterpartIndex: 0 }],
        });

        render(
            React.createElement(ChapterDiffStructuredDocument, {
                diffs: [whitespaceDiff],
                actionMode: "unsaved",
                hideWhitespaceOnly: false,
                showUsfmMarkers: true,
                chapterLabel: "Genesis 0",
                onRevertDiff: vi.fn(),
                onApplyDiffToCurrent: vi.fn(),
                onChapterAction: vi.fn(),
                originalLabel: "Original",
                currentLabel: "Current",
            }),
        );

        expect(
            document.querySelector('[data-id="curr-s5"]')?.textContent,
        ).toBe("\\s5 ");
        expect(
            document
                .querySelector('[data-id="curr-s5"]')
                ?.querySelector('[class*="diffHighlightAdded"]')
                ?.textContent,
        ).toBe(" ");
    });

    it("treats chapter tokens as modified when aligned text differs", () => {
        const whitespaceDiff = makeDiff({
            semanticSid: "GEN 0:0",
            bookCode: "GEN",
            chapterNum: 0,
            isWhitespaceChange: true,
            originalRenderTokens: [
                makeUsfmToken({
                    id: "orig-s5",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "s5",
                    sid: "GEN 0:0",
                    text: "\\s5",
                }),
            ],
            currentRenderTokens: [
                makeUsfmToken({
                    id: "curr-s5",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "s5",
                    sid: "GEN 0:0",
                    text: "\\s5 ",
                }),
            ],
            originalAlignment: [{ change: "unchanged", counterpartIndex: 0 }],
            currentAlignment: [{ change: "unchanged", counterpartIndex: 0 }],
        });

        render(
            React.createElement(ChapterDiffStructuredDocument, {
                diffs: [whitespaceDiff],
                actionMode: "unsaved",
                hideWhitespaceOnly: false,
                showUsfmMarkers: true,
                chapterLabel: "Genesis 0",
                onRevertDiff: vi.fn(),
                onApplyDiffToCurrent: vi.fn(),
                onChapterAction: vi.fn(),
                originalLabel: "Original",
                currentLabel: "Current",
            }),
        );

        expect(
            document
                .querySelector('[data-id="curr-s5"]')
                ?.querySelector('[class*="diffHighlightAdded"]')
                ?.textContent,
        ).toBe(" ");
    });

    it("highlights only changed subspans inside a modified chapter run", () => {
        const verseDiff = makeDiff({
            semanticSid: "GEN 1:2",
            chapterNum: 1,
            originalDisplayText: "\\v 2 The earth was without form.",
            currentDisplayText: "\\v 2 The earth is without form.",
            originalRenderTokens: [
                makeUsfmToken({
                    id: "orig-v-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:2",
                    text: "",
                }),
                makeUsfmToken({
                    id: "orig-v-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:2",
                    text: " 2",
                }),
                makeUsfmToken({
                    id: "orig-v-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:2",
                    text: " The earth was without form.",
                }),
            ],
            currentRenderTokens: [
                makeUsfmToken({
                    id: "curr-v-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:2",
                    text: "",
                }),
                makeUsfmToken({
                    id: "curr-v-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:2",
                    text: " 2",
                }),
                makeUsfmToken({
                    id: "curr-v-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:2",
                    text: " The earth is without form.",
                }),
            ],
            originalAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "modified", counterpartIndex: 2 },
            ],
            currentAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "modified", counterpartIndex: 2 },
            ],
        });

        render(
            React.createElement(ChapterDiffStructuredDocument, {
                diffs: [verseDiff],
                actionMode: "unsaved",
                hideWhitespaceOnly: false,
                showUsfmMarkers: true,
                chapterLabel: "Genesis 1",
                onRevertDiff: vi.fn(),
                onApplyDiffToCurrent: vi.fn(),
                onChapterAction: vi.fn(),
                originalLabel: "Original",
                currentLabel: "Current",
            }),
        );

        const currentText = document.querySelector('[data-id="curr-v-text"]');
        expect(currentText?.className).toBe("");
        expect(currentText?.textContent).toContain(" The earth is without form.");
        const addedSpans = currentText?.querySelectorAll('[class*="diffHighlightAdded"]');
        expect(addedSpans).toHaveLength(1);
        expect(addedSpans?.[0]?.textContent).toBe("is");
    });

    it("does not merge text across a removed linebreak into one oversized changed run", () => {
        const linebreakToSpaceDiff = makeDiff({
            semanticSid: "GEN 1:2",
            chapterNum: 1,
            originalDisplayText:
                "\\v 2 The earth was without form.\\nDarkness was upon the surface.",
            currentDisplayText:
                "\\v 2 The earth was without form. Darkness was upon the surface.",
            originalRenderTokens: [
                makeUsfmToken({
                    id: "orig-v2-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:2",
                    text: "",
                }),
                makeUsfmToken({
                    id: "orig-v2-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:2",
                    text: " 2",
                }),
                makeUsfmToken({
                    id: "orig-v2-text-a",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:2",
                    text: " The earth was without form.",
                }),
                {
                    sid: "GEN 1:2",
                    tokenType: UsfmTokenTypes.verticalWhitespace,
                    node: { type: "linebreak" } as unknown as SerializedLexicalNode,
                },
                makeUsfmToken({
                    id: "orig-v2-text-b",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:2",
                    text: "Darkness was upon the surface.",
                }),
            ],
            currentRenderTokens: [
                makeUsfmToken({
                    id: "curr-v2-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:2",
                    text: "",
                }),
                makeUsfmToken({
                    id: "curr-v2-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:2",
                    text: " 2",
                }),
                makeUsfmToken({
                    id: "curr-v2-text-a",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:2",
                    text: " The earth was without form.",
                }),
                makeUsfmToken({
                    id: "curr-v2-text-b",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:2",
                    text: " Darkness was upon the surface.",
                }),
            ],
            originalAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "unchanged", counterpartIndex: 2 },
                { change: "deleted", counterpartIndex: -1 },
                { change: "unchanged", counterpartIndex: 3 },
            ],
            currentAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "unchanged", counterpartIndex: 2 },
                { change: "unchanged", counterpartIndex: 4 },
            ],
        });

        render(
            React.createElement(ChapterDiffStructuredDocument, {
                diffs: [linebreakToSpaceDiff],
                actionMode: "unsaved",
                hideWhitespaceOnly: false,
                showUsfmMarkers: true,
                chapterLabel: "Genesis 1",
                onRevertDiff: vi.fn(),
                onApplyDiffToCurrent: vi.fn(),
                onChapterAction: vi.fn(),
                originalLabel: "Original",
                currentLabel: "Current",
            }),
        );

        const currentTrailingText = document.querySelector('[data-id="curr-v2-text-b"]');
        expect(currentTrailingText?.className).toBe("");
        const addedSpans = currentTrailingText?.querySelectorAll(
            '[class*="diffHighlightAdded"]',
        );
        expect(addedSpans).toHaveLength(1);
        expect(addedSpans?.[0]?.textContent).toBe(" ");
        expect(document.body.textContent).toContain("Darkness was upon the surface.");
    });

    it("splits a multi-verse diff entry into verse-sized display chunks", () => {
        const multiVerseDiff = makeDiff({
            semanticSid: "GEN 1:11",
            chapterNum: 1,
            originalDisplayText:
                "\\v 11 Let the earth sprout.\\n\\v 12 The earth produced vegetation.\\n\\v 13 And there was evening.",
            currentDisplayText:
                "\\v 12 The earth produced vegetation.\\n\\v 13 And there was evening.",
            originalRenderTokens: [
                makeUsfmToken({
                    id: "orig-v11-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:11",
                    text: "",
                }),
                makeUsfmToken({
                    id: "orig-v11-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:11",
                    text: " 11",
                }),
                makeUsfmToken({
                    id: "orig-v11-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:11",
                    text: " Let the earth sprout.",
                }),
                {
                    sid: "GEN 1:11",
                    tokenType: UsfmTokenTypes.verticalWhitespace,
                    node: { type: "linebreak" } as unknown as SerializedLexicalNode,
                },
                makeUsfmToken({
                    id: "orig-v12-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:12",
                    text: "",
                }),
                makeUsfmToken({
                    id: "orig-v12-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:12",
                    text: " 12",
                }),
                makeUsfmToken({
                    id: "orig-v12-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:12",
                    text: " The earth produced vegetation.",
                }),
                {
                    sid: "GEN 1:12",
                    tokenType: UsfmTokenTypes.verticalWhitespace,
                    node: { type: "linebreak" } as unknown as SerializedLexicalNode,
                },
                makeUsfmToken({
                    id: "orig-v13-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:13",
                    text: "",
                }),
                makeUsfmToken({
                    id: "orig-v13-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:13",
                    text: " 13",
                }),
                makeUsfmToken({
                    id: "orig-v13-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:13",
                    text: " And there was evening.",
                }),
            ],
            currentRenderTokens: [
                makeUsfmToken({
                    id: "curr-v12-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:12",
                    text: "",
                }),
                makeUsfmToken({
                    id: "curr-v12-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:12",
                    text: " 12",
                }),
                makeUsfmToken({
                    id: "curr-v12-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:12",
                    text: " The earth produced vegetation.",
                }),
                {
                    sid: "GEN 1:12",
                    tokenType: UsfmTokenTypes.verticalWhitespace,
                    node: { type: "linebreak" } as unknown as SerializedLexicalNode,
                },
                makeUsfmToken({
                    id: "curr-v13-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:13",
                    text: "",
                }),
                makeUsfmToken({
                    id: "curr-v13-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:13",
                    text: " 13",
                }),
                makeUsfmToken({
                    id: "curr-v13-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:13",
                    text: " And there was evening.",
                }),
            ],
            originalAlignment: [
                { change: "deleted", counterpartIndex: -1 },
                { change: "deleted", counterpartIndex: -1 },
                { change: "deleted", counterpartIndex: -1 },
                { change: "deleted", counterpartIndex: -1 },
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "unchanged", counterpartIndex: 2 },
                { change: "unchanged", counterpartIndex: 3 },
                { change: "unchanged", counterpartIndex: 4 },
                { change: "unchanged", counterpartIndex: 5 },
                { change: "unchanged", counterpartIndex: 6 },
            ],
            currentAlignment: [
                { change: "unchanged", counterpartIndex: 4 },
                { change: "unchanged", counterpartIndex: 5 },
                { change: "unchanged", counterpartIndex: 6 },
                { change: "unchanged", counterpartIndex: 7 },
                { change: "unchanged", counterpartIndex: 8 },
                { change: "unchanged", counterpartIndex: 9 },
                { change: "unchanged", counterpartIndex: 10 },
            ],
        });

        render(
            React.createElement(ChapterDiffStructuredDocument, {
                diffs: [multiVerseDiff],
                actionMode: "unsaved",
                hideWhitespaceOnly: false,
                showUsfmMarkers: true,
                chapterLabel: "Genesis 1",
                onRevertDiff: vi.fn(),
                onApplyDiffToCurrent: vi.fn(),
                onChapterAction: vi.fn(),
                originalLabel: "Original",
                currentLabel: "Current",
            }),
        );

        const currentV12Number = document.querySelector('[data-id="curr-v12-number"]');
        const currentV12Text = document.querySelector('[data-id="curr-v12-text"]');
        const currentV13Number = document.querySelector('[data-id="curr-v13-number"]');
        const currentV13Text = document.querySelector('[data-id="curr-v13-text"]');
        expect(currentV12Number?.textContent).toContain("12");
        expect(currentV12Text?.textContent).toContain("The earth produced vegetation.");
        expect(currentV13Number?.textContent).toContain("13");
        expect(currentV13Text?.textContent).toContain("And there was evening.");
        expect(currentV12Number?.querySelector('[class*="diffHighlightAdded"]')).toBeNull();
        expect(currentV12Text?.querySelector('[class*="diffHighlightAdded"]')).toBeNull();
        expect(currentV13Number?.querySelector('[class*="diffHighlightAdded"]')).toBeNull();
        expect(currentV13Text?.querySelector('[class*="diffHighlightAdded"]')).toBeNull();
    });

    it("realigns later verse paragraphs after a deleted verse even with structural markers present", () => {
        const structuralDeleteDiff = makeDiff({
            semanticSid: "GEN 1:29",
            chapterNum: 1,
            originalRenderTokens: [
                makeUsfmToken({
                    id: "orig-p-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "p",
                    sid: "GEN 1:29",
                    text: "",
                }),
                makeUsfmToken({
                    id: "orig-v29-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:29",
                    text: "",
                }),
                makeUsfmToken({
                    id: "orig-v29-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:29",
                    text: " 29",
                }),
                makeUsfmToken({
                    id: "orig-v29-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:29",
                    text: " God said.",
                }),
                {
                    sid: "GEN 1:29",
                    tokenType: UsfmTokenTypes.verticalWhitespace,
                    node: { type: "linebreak" } as unknown as SerializedLexicalNode,
                },
                makeUsfmToken({
                    id: "orig-s5-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "s5",
                    sid: "GEN 1:29",
                    text: "",
                }),
                {
                    sid: "GEN 1:29",
                    tokenType: UsfmTokenTypes.verticalWhitespace,
                    node: { type: "linebreak" } as unknown as SerializedLexicalNode,
                },
                makeUsfmToken({
                    id: "orig-v30-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:30",
                    text: "",
                }),
                makeUsfmToken({
                    id: "orig-v30-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:30",
                    text: " 30",
                }),
                makeUsfmToken({
                    id: "orig-v30-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:30",
                    text: " To every beast.",
                }),
                {
                    sid: "GEN 1:30",
                    tokenType: UsfmTokenTypes.verticalWhitespace,
                    node: { type: "linebreak" } as unknown as SerializedLexicalNode,
                },
                makeUsfmToken({
                    id: "orig-v31-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:31",
                    text: "",
                }),
                makeUsfmToken({
                    id: "orig-v31-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:31",
                    text: " 31",
                }),
                makeUsfmToken({
                    id: "orig-v31-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:31",
                    text: " God saw.",
                }),
            ],
            currentRenderTokens: [
                makeUsfmToken({
                    id: "curr-s5-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "s5",
                    sid: "GEN 1:29",
                    text: "",
                }),
                {
                    sid: "GEN 1:29",
                    tokenType: UsfmTokenTypes.verticalWhitespace,
                    node: { type: "linebreak" } as unknown as SerializedLexicalNode,
                },
                makeUsfmToken({
                    id: "curr-v30-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:30",
                    text: "",
                }),
                makeUsfmToken({
                    id: "curr-v30-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:30",
                    text: " 30",
                }),
                makeUsfmToken({
                    id: "curr-v30-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:30",
                    text: " To every beast.",
                }),
                {
                    sid: "GEN 1:30",
                    tokenType: UsfmTokenTypes.verticalWhitespace,
                    node: { type: "linebreak" } as unknown as SerializedLexicalNode,
                },
                makeUsfmToken({
                    id: "curr-v31-marker",
                    tokenType: UsfmTokenTypes.marker,
                    marker: "v",
                    sid: "GEN 1:31",
                    text: "",
                }),
                makeUsfmToken({
                    id: "curr-v31-number",
                    tokenType: UsfmTokenTypes.numberRange,
                    sid: "GEN 1:31",
                    text: " 31",
                }),
                makeUsfmToken({
                    id: "curr-v31-text",
                    tokenType: UsfmTokenTypes.text,
                    sid: "GEN 1:31",
                    text: " God saw.",
                }),
            ],
            originalAlignment: [
                { change: "deleted", counterpartIndex: -1 },
                { change: "deleted", counterpartIndex: -1 },
                { change: "deleted", counterpartIndex: -1 },
                { change: "deleted", counterpartIndex: -1 },
                { change: "deleted", counterpartIndex: -1 },
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "unchanged", counterpartIndex: 2 },
                { change: "unchanged", counterpartIndex: 3 },
                { change: "unchanged", counterpartIndex: 4 },
                { change: "unchanged", counterpartIndex: 5 },
                { change: "unchanged", counterpartIndex: 6 },
                { change: "unchanged", counterpartIndex: 7 },
                { change: "unchanged", counterpartIndex: 8 },
            ],
            currentAlignment: [
                { change: "unchanged", counterpartIndex: 5 },
                { change: "unchanged", counterpartIndex: 6 },
                { change: "unchanged", counterpartIndex: 7 },
                { change: "unchanged", counterpartIndex: 8 },
                { change: "unchanged", counterpartIndex: 9 },
                { change: "unchanged", counterpartIndex: 10 },
                { change: "unchanged", counterpartIndex: 11 },
                { change: "unchanged", counterpartIndex: 12 },
                { change: "unchanged", counterpartIndex: 13 },
            ],
        });

        render(
            React.createElement(ChapterDiffStructuredDocument, {
                diffs: [structuralDeleteDiff],
                actionMode: "unsaved",
                hideWhitespaceOnly: false,
                showUsfmMarkers: false,
                chapterLabel: "Genesis 1",
                onRevertDiff: vi.fn(),
                onApplyDiffToCurrent: vi.fn(),
                onChapterAction: vi.fn(),
                originalLabel: "Original",
                currentLabel: "Current",
            }),
        );

        const currentV30Number = document.querySelector('[data-id="curr-v30-number"]');
        const currentV30Text = document.querySelector('[data-id="curr-v30-text"]');
        const currentV31Number = document.querySelector('[data-id="curr-v31-number"]');
        const currentV31Text = document.querySelector('[data-id="curr-v31-text"]');
        expect(currentV30Number?.textContent).toContain("30");
        expect(currentV30Text?.textContent).toContain("To every beast.");
        expect(currentV31Number?.textContent).toContain("31");
        expect(currentV31Text?.textContent).toContain("God saw.");
        expect(currentV30Number?.querySelector('[class*="diffHighlightAdded"]')).toBeNull();
        expect(currentV30Text?.querySelector('[class*="diffHighlightAdded"]')).toBeNull();
        expect(currentV31Number?.querySelector('[class*="diffHighlightAdded"]')).toBeNull();
        expect(currentV31Text?.querySelector('[class*="diffHighlightAdded"]')).toBeNull();
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
                compareSourceKind: COMPARE_SOURCE_KIND.PREVIOUS_VERSION,
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
                loadCompareRemoteLatest: vi.fn(async () => {}),
                compareWarnings: [],
                takeIncomingAll: vi.fn(),
                hasComputedCompare: true,
                resetExternalCompare: vi.fn(),
            }),
        );

        expect(document.body.textContent).toContain(
            "Comparing your current vs Mar 11, 2026, 9:00 AM",
        );
        expect(document.body.textContent).not.toContain("Current saved");
        expect(document.body.textContent).not.toContain("Current dirty");
    });

    it("shows incoming cloud changes when the remote compare source is active", () => {
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
                compareSourceKind: COMPARE_SOURCE_KIND.REMOTE_LATEST,
                setCompareSourceKind: vi.fn(),
                compareSourceProjectId: "",
                setCompareSourceProjectId: vi.fn(),
                compareSourceVersionHash: "",
                setCompareSourceVersionHash: vi.fn(),
                compareProjects: [],
                compareVersionOptions: [],
                loadCompareProject: vi.fn(async () => {}),
                loadCompareZip: vi.fn(async () => {}),
                loadCompareDirectory: vi.fn(async () => {}),
                loadCompareVersion: vi.fn(async () => {}),
                loadCompareRemoteLatest: vi.fn(async () => {}),
                compareWarnings: [],
                takeIncomingAll: vi.fn(),
                hasComputedCompare: true,
                resetExternalCompare: vi.fn(),
            }),
        );

        expect(document.body.textContent).toContain(
            "Comparing your current vs Incoming cloud changes",
        );
    });

    it("keeps both accept-all and save-all actions visible in external compare", () => {
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
                compareSourceKind: COMPARE_SOURCE_KIND.PREVIOUS_VERSION,
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
                loadCompareRemoteLatest: vi.fn(async () => {}),
                compareWarnings: [],
                takeIncomingAll: vi.fn(),
                hasComputedCompare: true,
                resetExternalCompare: vi.fn(),
            }),
        );

        expect(document.body.textContent).toContain(
            "Accept all incoming changes in all chapters",
        );
        expect(document.body.textContent).toContain("Save all changes");
        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.save.saveAllButton}"]`,
            ),
        ).not.toBeNull();
    });
});
