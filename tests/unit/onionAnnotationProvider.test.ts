import { i18n } from "@lingui/core";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { EditorAnnotation } from "@/app/domain/editor/annotations/editorAnnotation.ts";
import {
    lintIssueToAnnotation,
    lintIssuesToAnnotations,
} from "@/app/domain/editor/annotations/onionAnnotationProvider.tsx";
import { getLintIssueKey } from "@/app/ui/hooks/lintState.ts";
import {
    formatLintIssueMessage,
    formatTokenFixLabel,
} from "@/app/ui/i18n/usfmOnionLocalization.ts";
import type { LintIssue, TokenFix } from "@/core/domain/usfm/usfmOnionTypes.ts";

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

// The provider only reads `code` + `labelParams` off a fix (via
// `formatTokenFixLabel`); a minimal stub is enough to exercise it.
// onion annotations always carry a token anchor; narrow for the assertion.
function tokenAnchorId(annotation: EditorAnnotation): string {
    if (annotation.anchor.kind !== "token") {
        throw new Error(`expected a token anchor, got ${annotation.anchor.kind}`);
    }
    return annotation.anchor.tokenId;
}

const sampleFix = {
    code: "set-number",
    label: "Set number",
    labelParams: { number: "2" },
} as unknown as TokenFix;

describe("onion annotation provider (default)", () => {
    beforeAll(() => {
        i18n.load("en", {});
        i18n.activate("en");
    });

    it("maps an issue's localized message and identity onto the annotation", () => {
        const issue = makeIssue({ code: "verse-is-empty", fix: undefined });
        const annotation = lintIssueToAnnotation(issue, {
            applyFix: () => undefined,
        });

        expect(annotation.id).toBe(getLintIssueKey(issue));
        expect(annotation.source).toBe("onion");
        expect(annotation.code).toBe("verse-is-empty");
        expect(annotation.severity).toBe(issue.severity);
        // The popover localizes through the shared formatter, not the raw
        // `issue.message` fallback — that delegation is the contract.
        expect(annotation.message).toBe(formatLintIssueMessage(issue));
    });

    it("emits exactly one primary action that applies the fix, when a fix exists", () => {
        const applyFix = vi.fn();
        const issue = makeIssue({ code: "missing-verse-number", fix: sampleFix });
        const annotation = lintIssueToAnnotation(issue, { applyFix });

        expect(annotation.actions).toHaveLength(1);
        const action = annotation.actions?.[0];
        expect(action?.kind).toBe("primary");
        expect(action?.label).toBe(formatTokenFixLabel(sampleFix));

        action?.run();
        // The action must fix *this* issue, not some recomputed one.
        expect(applyFix).toHaveBeenCalledTimes(1);
        expect(applyFix).toHaveBeenCalledWith(issue);
    });

    it("emits zero actions for an issue without a fix", () => {
        const issue = makeIssue({ fix: undefined });
        const annotation = lintIssueToAnnotation(issue, {
            applyFix: () => undefined,
        });
        expect(annotation.actions).toEqual([]);
    });

    it("anchors on tokenId, falling back to relatedTokenId then a sentinel", () => {
        const ctx = { applyFix: () => undefined };
        expect(
            lintIssueToAnnotation(makeIssue({ tokenId: "t1" }), ctx).anchor,
        ).toMatchObject({ kind: "token", tokenId: "t1" });
        expect(
            tokenAnchorId(
                lintIssueToAnnotation(
                    makeIssue({ tokenId: undefined, relatedTokenId: "r1" }),
                    ctx,
                ),
            ),
        ).toBe("r1");
        expect(
            tokenAnchorId(
                lintIssueToAnnotation(
                    makeIssue({ tokenId: undefined, relatedTokenId: undefined }),
                    ctx,
                ),
            ),
        ).toBe("?");
    });

    it("maps a list preserving order", () => {
        const issues = [
            makeIssue({ tokenId: "a" }),
            makeIssue({ tokenId: "b" }),
        ];
        const annotations = lintIssuesToAnnotations(issues, {
            applyFix: () => undefined,
        });
        expect(annotations.map(tokenAnchorId)).toEqual(["a", "b"]);
    });
});

describe("onion annotation provider (per-code override: chapter label)", () => {
    beforeAll(() => {
        i18n.load("en", {});
        i18n.activate("en");
    });

    function chapterLabelIssue(): LintIssue {
        return makeIssue({
            code: "inconsistent-chapter-label",
            fix: undefined,
            messageParams: { expected: "Wase", found: "Marika", marker: "cl" },
        });
    }

    it("adds a project-wide standardize action wired to the opener", () => {
        const onStandardizeChapterLabels = vi.fn();
        const annotation = lintIssueToAnnotation(chapterLabelIssue(), {
            applyFix: () => undefined,
            onStandardizeChapterLabels,
        });

        // The override keeps the default message and adds exactly the one
        // app-defined action — the registry's whole purpose.
        const action = annotation.actions?.find(
            (a) => a.id === "standardize-chapter-label",
        );
        expect(action).toBeDefined();
        action?.run();
        expect(onStandardizeChapterLabels).toHaveBeenCalledTimes(1);
    });

    it("omits the action when no opener is wired (e.g. form mode)", () => {
        const annotation = lintIssueToAnnotation(chapterLabelIssue(), {
            applyFix: () => undefined,
        });
        expect(annotation.actions).toEqual([]);
    });
});
