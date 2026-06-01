import { describe, expect, it } from "vitest";
import {
    detectLineEnding,
    tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { ScriptureChapterState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { isChapterDirtyUsfm } from "@/app/domain/project/saveAndRevertService.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

// Regression guard for the CRLF/LF phantom-diff bug: a file loaded from a git
// remote with CRLF line endings was re-serialized with LF, so an untouched file
// showed as a whole-file "edit". The fix re-applies the file's EOL at the
// `tokensToUsfm` waist, where `detectLineEnding` recovered it from onion's
// parse (newline tokens keep their original `\r\n` / `\n` source).

let nextId = 0;
const text = (source: string, sid = "GEN 1:1"): Token =>
    ({
        id: `t${nextId++}`,
        kind: "text",
        span: { start: 0, end: source.length },
        sid,
        source,
    }) as Token;
const newline = (source: "\n" | "\r\n"): Token =>
    ({
        id: `nl${nextId++}`,
        kind: "newline",
        span: { start: 0, end: source.length },
        sid: "",
        source,
    }) as Token;

// Same logical content, differing only in how newline tokens carry their EOL.
// `crlf` mimics onion's parse of a Windows file; `lf` mimics what the editor
// produces after a round-trip (`lexicalToTokens` stamps "\n").
const crlfTokens = () => [text("\\p"), newline("\r\n"), text("Verse one.")];
const lfTokens = () => [text("\\p"), newline("\n"), text("Verse one.")];

const chapter = (
    sourceTokens: Token[],
    currentTokens: Token[],
    eol: "\n" | "\r\n",
): ScriptureChapterState =>
    ({ sourceTokens, currentTokens, eol }) as ScriptureChapterState;

describe("detectLineEnding", () => {
    it("recovers CRLF from the first newline token", () => {
        expect(detectLineEnding(crlfTokens())).toBe("\r\n");
    });

    it("recovers LF from the first newline token", () => {
        expect(detectLineEnding(lfTokens())).toBe("\n");
    });

    it("defaults to LF when there is no newline token", () => {
        expect(detectLineEnding([text("\\id GEN")])).toBe("\n");
    });
});

describe("tokensToUsfm EOL emission", () => {
    it("emits the file EOL for newline tokens regardless of their stored source", () => {
        // The LF-stamped editor tokens still serialize as CRLF when the file is
        // CRLF — this is what stops the whole-file phantom diff.
        expect(tokensToUsfm(lfTokens(), "\r\n")).toBe("\\p\r\nVerse one.");
        expect(tokensToUsfm(crlfTokens(), "\r\n")).toBe("\\p\r\nVerse one.");
        expect(tokensToUsfm(crlfTokens(), "\n")).toBe("\\p\nVerse one.");
    });
});

describe("isChapterDirtyUsfm with EOL preservation", () => {
    it("a CRLF file re-serialized as LF is NOT dirty (the bug)", () => {
        // sourceTokens as onion parsed them (CRLF); currentTokens as the editor
        // re-emitted them (LF) with identical content.
        const c = chapter(crlfTokens(), lfTokens(), "\r\n");
        expect(isChapterDirtyUsfm(c)).toBe(false);
    });

    it("a genuine content edit is still dirty, and keeps CRLF", () => {
        const edited = [text("\\p"), newline("\n"), text("Verse TWO.")];
        const c = chapter(crlfTokens(), edited, "\r\n");
        expect(isChapterDirtyUsfm(c)).toBe(true);
        expect(tokensToUsfm(c.currentTokens, c.eol)).toBe(
            "\\p\r\nVerse TWO.",
        );
    });

    it("an LF file stays clean on a no-op round-trip", () => {
        const c = chapter(lfTokens(), lfTokens(), "\n");
        expect(isChapterDirtyUsfm(c)).toBe(false);
    });
});
