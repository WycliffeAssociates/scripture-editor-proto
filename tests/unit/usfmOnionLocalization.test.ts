import * as onion from "usfm-onion-web";
import { describe, expect, it } from "vitest";
import { LOCALIZED_LINT_CODES } from "@/app/ui/i18n/usfmOnionLocalization.ts";

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
