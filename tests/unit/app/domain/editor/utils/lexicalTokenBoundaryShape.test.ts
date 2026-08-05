// The boundary shape of an editor-authored token.
//
// `lexicalToTokens` output is handed straight to wasm — `tokensToUsfm`,
// `lintTokens`, Braid's `updateChapter` — and structured-cloned to the mirror
// worker on the way. At that boundary an own property holding `undefined` is
// NOT equivalent to an absent one: the decoder reads each field with
// `Reflect.get`, so a present-but-undefined property is decoded as a value
// rather than falling back to the field's default. `Token.attributes` decodes
// as a sequence, and a sequence read from `undefined` throws
// (`TypeError: Reflect.get called on non-object`) instead of defaulting to
// empty — which is how this was found.
//
// The round-trip suites cover it only incidentally, and only while upstream
// happens to throw rather than silently accept. This states the rule directly.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  lexicalToTokens,
  tokensToLexical,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  dirname,
  "../../../../../mockData/synthetic/kitchen-sink.usfm",
);

describe("editor-authored tokens at the wasm boundary", () => {
  it("never carries an own property whose value is undefined", async () => {
    const usfm = readFileSync(FIXTURE, "utf8");
    const { tokens } = await webUsfmOnionService.parseUsfm(usfm);
    const roundTripped = lexicalToTokens(
      tokensToLexical({ tokens, direction: "ltr", mode: "flat" }),
    ) as unknown as ReadonlyArray<Record<string, unknown>>;

    expect(roundTripped.length).toBeGreaterThan(0);
    const offenders = roundTripped.flatMap((token, index) =>
      Object.entries(token)
        .filter(([, value]) => value === undefined)
        .map(([key]) => `${index}.${key}`),
    );
    expect(offenders).toEqual([]);
  });

  // A `bookCode` token's payload is the code plus Onion's verdict on whether
  // it names a recognized USFM book. The editor cannot re-derive the verdict,
  // so a round trip that drops it produces a token Braid refuses outright —
  // `Illegal { reason: MissingPayload { kind: BookCode } }`, which kills the
  // whole patch and desyncs the mirror for the rest of the session. Onion
  // refuses half the payload too, so the two travel together or not at all.
  it("carries the \\id token's payload back out intact", async () => {
    // Parsed inline rather than from the kitchen sink: Onion only emits a
    // `bookCode` token when the `\id` value actually parses as one, and that
    // fixture's id line carries a trailing description, so its value comes
    // back as plain text.
    const { tokens } = await webUsfmOnionService.parseUsfm(
      "\\id EXO\n\\c 1 \\p\n\\v 1 In the beginning\n",
    );
    const source = tokens.find((token) => token.kind === "bookCode");
    expect(source, "the fixture must contain an \\id book code").toBeDefined();

    const roundTripped = lexicalToTokens(
      tokensToLexical({ tokens, direction: "ltr", mode: "flat" }),
    ).find((token) => token.kind === "bookCode");

    expect(roundTripped?.bookCode).toBe(source?.bookCode);
    expect(roundTripped?.bookCodeValid).toBe(source?.bookCodeValid);
  });
});
