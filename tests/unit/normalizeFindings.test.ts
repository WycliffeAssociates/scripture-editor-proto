// Contracts of the producer → Finding normalizers, with the identity
// invariants the overlay-diff design leans on (findings plan §6.1): ids are
// deterministic across passes, exclude message text and fix payloads, and
// disambiguate twins with stable occurrence suffixes.

import { describe, expect, it } from "vitest";
import type { Finding } from "@/app/domain/editor/annotations/finding.ts";
import {
    lintIssuesToFindings,
    sousFindingsToFindings,
} from "@/app/domain/editor/annotations/normalizeFindings.ts";
import type { SousFinding } from "@/core/domain/sous/sousTypes.ts";
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

function tokenAnchorId(finding: Finding): string {
    if (finding.anchor.kind !== "token") {
        throw new Error(`expected a token anchor, got ${finding.anchor.kind}`);
    }
    return finding.anchor.tokenId;
}

describe("lintIssuesToFindings", () => {
    it("derives identical ids across two passes over the same engine output", () => {
        const issues = [
            makeIssue({ tokenId: "a" }),
            makeIssue({ tokenId: "b", code: "verse-is-empty" }),
        ];
        const first = lintIssuesToFindings(issues).map((f) => f.id);
        const second = lintIssuesToFindings(issues).map((f) => f.id);
        expect(second).toEqual(first);
    });

    it("ids exclude message text and fix payload — locale or surrounding-content drift causes zero churn", () => {
        const fix = { code: "set-number", labelParams: { number: "2" } };
        const base = makeIssue({ fix: fix as unknown as TokenFix });
        const messageChanged = makeIssue({
            fix: fix as unknown as TokenFix,
            message: "totally different localized text",
        });
        const fixChanged = makeIssue({
            fix: {
                code: "set-number",
                labelParams: { number: "9" },
            } as unknown as TokenFix,
        });

        const [a] = lintIssuesToFindings([base]);
        const [b] = lintIssuesToFindings([messageChanged]);
        const [c] = lintIssuesToFindings([fixChanged]);
        expect(b.id).toBe(a.id);
        expect(c.id).toBe(a.id);
    });

    it("gives twins distinct ids whose set is independent of engine output order", () => {
        const twin = () => makeIssue({ tokenId: "t1" });
        const forward = lintIssuesToFindings([twin(), twin()]).map(
            (f) => f.id,
        );
        const reversed = lintIssuesToFindings([twin(), twin()]).map(
            (f) => f.id,
        );
        expect(new Set(forward).size).toBe(2);
        expect(new Set(reversed)).toEqual(new Set(forward));
    });

    it("anchors on tokenId, falling back to relatedTokenId then a sentinel", () => {
        expect(
            tokenAnchorId(lintIssuesToFindings([makeIssue({ tokenId: "t1" })])[0]),
        ).toBe("t1");
        expect(
            tokenAnchorId(
                lintIssuesToFindings([
                    makeIssue({ tokenId: undefined, relatedTokenId: "r1" }),
                ])[0],
            ),
        ).toBe("r1");
        expect(
            tokenAnchorId(
                lintIssuesToFindings([
                    makeIssue({ tokenId: undefined, relatedTokenId: undefined }),
                ])[0],
            ),
        ).toBe("?");
    });

    it("carries identity fields, payload, and category; preserves input order", () => {
        const issues = [
            makeIssue({ tokenId: "a" }),
            makeIssue({ tokenId: "b", issueType: "content" }),
        ];
        const findings = lintIssuesToFindings(issues);

        expect(findings.map(tokenAnchorId)).toEqual(["a", "b"]);
        expect(findings[0].source).toBe("onion");
        expect(findings[0].code).toBe("unknown-token");
        expect(findings[0].severity).toBe("warning");
        expect(findings[0].category).toBe("structure");
        expect(findings[1].category).toBe("content");
        // The producer payload rides along for decoration/formatting.
        expect(
            findings[0].source === "onion" ? findings[0].issue : null,
        ).toBe(issues[0]);
        // Hover zip inputs: the issue's own and related token ids.
        expect(findings[0].touchedTokenIds).toEqual(["a"]);
    });
});

describe("sousFindingsToFindings", () => {
    const finding: SousFinding = {
        sid: "GEN 1:1",
        code: "lex.excess-h-whitespace",
        severity: "warning",
        start: 7,
        end: 9,
        score: 0.8,
    };

    it("maps to a content-anchored finding with deterministic identity", () => {
        const [first] = sousFindingsToFindings([finding]);
        const [second] = sousFindingsToFindings([finding]);

        expect(first.source).toBe("sous-chef");
        expect(first.category).toBe("content");
        // The content anchor carries the sid + UTF-16 range — what
        // resolveContentRange consumes to draw the precise highlight.
        expect(first.anchor).toEqual({
            kind: "content",
            sid: "GEN 1:1",
            range: { start: 7, end: 9 },
        });
        expect(first.source === "sous-chef" ? first.score : null).toBe(0.8);
        expect(second.id).toBe(first.id);
    });
});
