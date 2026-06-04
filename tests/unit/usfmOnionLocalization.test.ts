import { i18n } from "@lingui/core";
import * as onion from "usfm-onion-web";
import { beforeAll, describe, expect, it } from "vitest";
import {
    formatLintIssueMessage,
    LOCALIZED_LINT_CODES,
} from "@/app/ui/i18n/usfmOnionLocalization.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

function diff(left: readonly string[], right: readonly string[]) {
    const rightSet = new Set(right);
    return [...new Set(left)].filter((item) => !rightSet.has(item)).sort();
}

describe("usfm onion localization coverage", () => {
    it("covers all upstream lint codes", () => {
        const upstream = onion.lintCodes().sort();
        const local = [...LOCALIZED_LINT_CODES].sort();

        expect(diff(upstream, local)).toEqual([]);
        expect(diff(local, upstream)).toEqual([]);
    });
});

function makeIssue(overrides: Partial<LintIssue> = {}): LintIssue {
    return {
        message: "fallback",
        template: "",
        code: "unknown-token",
        category: "structure",
        severity: "warning",
        issueType: "usfm",
        messageParams: {},
        sid: "GEN 18:1",
        ...overrides,
    } as LintIssue;
}

describe("formatLintIssueMessage ICU interpolation", () => {
    beforeAll(() => {
        i18n.load("en", {});
        i18n.activate("en");
    });

    it("substitutes the chapter-label placeholders (not literal braces)", () => {
        // Regression: the message wrapped the placeholders in straight single
        // quotes, which ICU MessageFormat treats as escaping — so '{found}'
        // rendered literally instead of substituting. Double quotes fix it.
        const message = formatLintIssueMessage(
            makeIssue({
                code: "inconsistent-chapter-label",
                messageParams: { found: "Marika", expected: "Wase" },
            }),
        );
        expect(message).toContain("Marika");
        expect(message).toContain("Wase");
        expect(message).not.toContain("{found}");
        expect(message).not.toContain("{expected}");
    });
});
