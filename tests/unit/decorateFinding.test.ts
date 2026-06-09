// Contracts of the decorator registry: behavior attaches at the React edge
// from generic capabilities, the message comes from the one shared formatter,
// and per-code decorators reach features through domain functions — never
// through bespoke ctx callbacks.

import { i18n } from "@lingui/core";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
    decorateFinding,
    decorateFindingInert,
    type FindingDecorationContext,
} from "@/app/domain/editor/annotations/decorators/decorateFinding.tsx";
import type { Finding } from "@/app/domain/editor/annotations/finding.ts";
import {
    lintIssuesToFindings,
    sousFindingsToFindings,
} from "@/app/domain/editor/annotations/normalizeFindings.ts";
import { ChapterLabelPicker } from "@/app/ui/components/blocks/ChapterLabelPicker.tsx";
import {
    formatLintIssueMessage,
    formatTokenFixLabel,
} from "@/app/ui/i18n/usfmOnionLocalization.ts";
import type { LintIssue, TokenFix } from "@/core/domain/usfm/usfmOnionTypes.ts";

const fixLintFindingMock = vi.hoisted(() => vi.fn());
const standardizeChapterLabelsMock = vi.hoisted(() => vi.fn());
const computeChapterLabelTallyMock = vi.hoisted(() =>
    vi.fn(() => ({ counts: [{ stem: "Wase", count: 3 }], dominant: "Wase" })),
);

vi.mock(
    "@/app/domain/editor/annotations/decorators/lintFix.ts",
    () => ({ fixLintFinding: fixLintFindingMock }),
);
vi.mock(
    "@/app/domain/editor/annotations/decorators/chapterLabelStandardize.ts",
    () => ({
        standardizeChapterLabels: standardizeChapterLabelsMock,
        computeChapterLabelTally: computeChapterLabelTallyMock,
    }),
);

function makeIssue(overrides: Partial<LintIssue> = {}): LintIssue {
    return {
        message: "msg",
        template: "msg",
        code: "unknown-token",
        category: "structure",
        severity: "warning",
        issueType: "usfm",
        messageParams: {},
        sid: "GEN 1:1",
        tokenId: "n1",
        span: { start: 0, end: 1 },
        ...overrides,
    } as LintIssue;
}

function makeCtx(): FindingDecorationContext {
    return {
        workingFilesStore: { read: () => [] },
        interactionGate: { get: () => ({ kind: "open" }) },
        history: {},
        usfmOnionService: {},
        editorMode: "regular",
        findingsStore: { commitBookFindings: vi.fn() },
        openModal: vi.fn(),
        closeModal: vi.fn(),
    } as unknown as FindingDecorationContext;
}

const sampleFix = {
    code: "set-number",
    label: "Set number",
    labelParams: { number: "2" },
} as unknown as TokenFix;

describe("decorateFinding (default onion)", () => {
    beforeAll(() => {
        i18n.load("en", {});
        i18n.activate("en");
    });

    it("formats the message through the shared formatter, not the raw issue text", () => {
        const issue = makeIssue({ code: "verse-is-empty", fix: undefined });
        const [finding] = lintIssuesToFindings([issue]);
        const decorated = decorateFinding(finding, makeCtx());

        expect(decorated.id).toBe(finding.id);
        expect(decorated.message).toBe(formatLintIssueMessage(issue));
    });

    it("emits exactly one primary action that fixes THIS issue, when a fix exists", () => {
        const issue = makeIssue({
            code: "missing-verse-number",
            fix: sampleFix,
        });
        const [finding] = lintIssuesToFindings([issue]);
        const ctx = makeCtx();
        const decorated = decorateFinding(finding, ctx);

        expect(decorated.actions).toHaveLength(1);
        const action = decorated.actions[0];
        expect(action.kind).toBe("primary");
        expect(action.label).toBe(formatTokenFixLabel(sampleFix));

        action.run();
        expect(fixLintFindingMock).toHaveBeenCalledTimes(1);
        expect(fixLintFindingMock).toHaveBeenCalledWith(issue, ctx);
    });

    it("emits zero actions for an issue without a fix", () => {
        const [finding] = lintIssuesToFindings([makeIssue({ fix: undefined })]);
        expect(decorateFinding(finding, makeCtx()).actions).toEqual([]);
    });
});

describe("decorateFinding (per-code override: chapter label)", () => {
    beforeAll(() => {
        i18n.load("en", {});
        i18n.activate("en");
    });

    // `inconsistent-chapter-label` is no longer an onion LintCode — the library
    // dropped it as a consistency heuristic (usfm_onion plan-lint-scope.md §2);
    // the editor will re-emit it from its own token-space reduce. The decorator
    // registry keys on the string `finding.code`, decoupled from onion's union,
    // so we build the onion Finding directly rather than route a dropped code
    // through a LintIssue (whose `code` is the strict onion union).
    function chapterLabelFinding(): Finding {
        return {
            id: "chapter-label-1",
            source: "onion",
            code: "inconsistent-chapter-label",
            severity: "warning",
            category: "structure",
            anchor: { kind: "token", tokenId: "n1", sid: "GEN 1:1" },
            issue: makeIssue({
                fix: undefined,
                messageParams: {
                    expected: "Wase",
                    found: "Marika",
                    marker: "cl",
                },
            }),
        };
    }

    it("adds a project-wide standardize action that tallies and opens the picker via the outlet", () => {
        const ctx = makeCtx();
        const decorated = decorateFinding(chapterLabelFinding(), ctx);

        const action = decorated.actions.find(
            (a) => a.id === "standardize-chapter-label",
        );
        expect(action).toBeDefined();

        action?.run();
        expect(computeChapterLabelTallyMock).toHaveBeenCalledTimes(1);
        expect(ctx.openModal).toHaveBeenCalledTimes(1);
        const [Component, props] = vi.mocked(ctx.openModal).mock.calls[0] as [
            unknown,
            { isOpen: boolean; onConfirm: (stem: string) => void },
        ];
        expect(Component).toBe(ChapterLabelPicker);
        expect(props.isOpen).toBe(true);

        // Confirm closes the modal and runs the SAME domain function any
        // other doorway would — no decoration in that call path.
        props.onConfirm("Wase");
        expect(ctx.closeModal).toHaveBeenCalledTimes(1);
        expect(standardizeChapterLabelsMock).toHaveBeenCalledWith("Wase", ctx);
    });
});

describe("decorateFinding (sous) and inert decoration", () => {
    beforeAll(() => {
        i18n.load("en", {});
        i18n.activate("en");
    });

    it("decorates sous findings as report-only with the localized message", () => {
        const [finding] = sousFindingsToFindings([
            {
                sid: "GEN 1:1",
                code: "lex.excess-h-whitespace",
                severity: "warning",
                start: 7,
                end: 9,
            },
        ]);
        const decorated = decorateFinding(finding, makeCtx());
        expect(decorated.actions).toEqual([]);
        expect(decorated.message).not.toBe(finding.code);
        expect(decorated.message.length).toBeGreaterThan(0);
    });

    it("humanizes an unmapped sous rule code rather than showing the raw id", () => {
        const [finding] = sousFindingsToFindings([
            {
                sid: "GEN 1:1",
                code: "hyg.some-future-rule",
                severity: "info",
                start: 0,
                end: 1,
            },
        ]);
        expect(decorateFinding(finding, makeCtx()).message).toBe(
            "Some future rule",
        );
    });

    it("decorateFindingInert yields message-only decoration without a ctx", () => {
        const [finding] = lintIssuesToFindings([
            makeIssue({ code: "verse-is-empty", fix: sampleFix }),
        ]);
        const decorated = decorateFindingInert(finding);
        expect(decorated.actions).toEqual([]);
        expect(decorated.message.length).toBeGreaterThan(0);
    });
});
