import { describe, expect, it } from "vitest";
import { parseSid } from "@/core/data/bible/bible.ts";

describe("parseSid", () => {
    it("parses locally-unique SID suffixes like _dup_1", () => {
        const parsed = parseSid("GEN 1:1_dup_1");
        expect(parsed).not.toBeNull();
        expect(parsed?.book).toBe("GEN");
        expect(parsed?.chapter).toBe(1);
        expect(parsed?.verseStart).toBe(1);
        expect(parsed?.verseEnd).toBe(1);
        expect(parsed?.isBookChapOnly).toBe(false);
    });
});
