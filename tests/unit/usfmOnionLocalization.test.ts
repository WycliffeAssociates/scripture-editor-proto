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

    it("substitutes a double-quoted placeholder (not literal braces)", () => {
        // Regression: a message that wraps a placeholder in straight single
        // quotes has ICU MessageFormat treat them as escaping — so '{text}'
        // renders literally instead of substituting. Double quotes fix it.
        // (Originally guarded the dropped `inconsistent-chapter-label` case;
        // repointed to `unknown-token`, which still double-quotes its param.)
        const message = formatLintIssueMessage(
            makeIssue({
                code: "unknown-token",
                messageParams: { text: "Marika" },
            }),
        );
        expect(message).toContain("Marika");
        expect(message).not.toContain("{text}");
    });
});
