import { i18n } from "@lingui/core";
import { beforeAll, describe, expect, it } from "vitest";
import { sousFindingToAnnotation } from "@/app/domain/editor/annotations/sousAnnotationProvider.ts";
import type { SousFinding } from "@/core/domain/sous/sousTypes.ts";

describe("sous annotation provider", () => {
    beforeAll(() => {
        i18n.load("en", {});
        i18n.activate("en");
    });

    it("maps a finding to a content-anchored annotation", () => {
        const finding: SousFinding = {
            sid: "GEN 1:1",
            code: "lex.excess-h-whitespace",
            severity: "warning",
            start: 7,
            end: 9,
            score: 0.8,
        };
        const annotation = sousFindingToAnnotation(finding);

        expect(annotation.source).toBe("sous-chef");
        expect(annotation.score).toBe(0.8);
        // The content anchor carries the sid + UTF-16 range — what
        // resolveContentRange consumes to draw the precise highlight.
        expect(annotation.anchor).toEqual({
            kind: "content",
            sid: "GEN 1:1",
            range: { start: 7, end: 9 },
        });
        // Message localizes through the sous formatter, not the raw code.
        expect(annotation.message).not.toBe(finding.code);
        expect(annotation.message.length).toBeGreaterThan(0);
    });

    it("humanizes an unmapped rule code rather than showing the raw id", () => {
        const annotation = sousFindingToAnnotation({
            sid: "GEN 1:1",
            code: "hyg.some-future-rule",
            severity: "info",
            start: 0,
            end: 1,
        });
        expect(annotation.message).toBe("Some future rule");
    });
});
