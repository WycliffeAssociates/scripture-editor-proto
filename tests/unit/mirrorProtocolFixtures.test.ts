import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { MirrorPatch } from "@/app/domain/mirror/mirrorProtocol.ts";

// The canonical wire fixtures live with the Rust crate so a `cargo test` can
// `include_str!` them; this test reads the SAME file and pins it to the TS
// types. The Rust test deserializes it into the DTOs. If either side's wire
// shape drifts from the other, that side's test fails — the lightweight guard
// for the hand-maintained TS<->Rust protocol contract (no codegen).
const fixturePath = fileURLToPath(
  new URL(
    "../../src/tauri/rust/tests/fixtures/mirror-protocol.json",
    import.meta.url,
  ),
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  patches: MirrorPatch[];
};

describe("mirror protocol fixtures — TS side of the cross-language contract", () => {
  it("covers every MirrorPatch kind (compile-time exhaustive)", () => {
    // A Record keyed by the union forces a compile error here if a new patch
    // kind is added without a fixture — the exhaustiveness tripwire.
    const seen: Record<MirrorPatch["kind"], boolean> = {
      pushChapter: false,
      deleteChapter: false,
      updateBook: false,
      removeBook: false,
      pushBaseline: false,
      fullSync: false,
      residentSeed: false,
      syncMeta: false,
    };
    for (const patch of fixture.patches) seen[patch.kind] = true;
    expect(Object.values(seen).every(Boolean)).toBe(true);
  });

  it("matches the TS field shapes per kind (field access is type-checked)", () => {
    for (const patch of fixture.patches) {
      // Narrowing on `kind` types each branch — accessing a field that the TS
      // type renamed/removed is a compile error, so this loop pins field names.
      switch (patch.kind) {
        case "pushChapter":
          expect(patch.ref.bookCode).toBe("GEN");
          expect(patch.ref.chapterNum).toBe(1);
          expect(patch.chapter.tokens.length).toBe(1);
          expect(patch.chapter.eol).toBe("\n");
          expect(patch.chapter.dirty).toBe(true);
          expect(patch.generation).toBe(5);
          break;
        case "deleteChapter":
          expect(patch.ref.chapterNum).toBe(2);
          expect(patch.generation).toBe(6);
          break;
        case "updateBook":
          expect(patch.book.bookCode).toBe("GEN");
          expect(patch.book.chapters[0]?.chapterNum).toBe(1);
          expect(patch.generation).toBe(10);
          break;
        case "removeBook":
          expect(patch.bookCode).toBe("MAT");
          expect(patch.generation).toBe(11);
          break;
        case "pushBaseline":
          expect(patch.bookCode).toBe("GEN");
          expect(patch.diskBaseline.kind).toBe("present");
          break;
        case "fullSync":
          expect(patch.books[0].bookCode).toBe("EXO");
          expect(patch.books[0].chapters[0].chapterNum).toBe(1);
          expect(patch.books[0].diskBaseline.kind).toBe("absent");
          break;
        case "residentSeed":
          expect(patch.books[0].bookCode).toBe("EXO");
          expect(patch.books[0].chapters[0].chapterNum).toBe(1);
          expect(patch.books[0].chapters[0].eol).toBe("\n");
          break;
        case "syncMeta":
          expect(patch.books[0].chapterDirty[0].dirty).toBe(false);
          break;
        default: {
          // Exhaustiveness: a new kind makes `patch` non-never here → compile error.
          const _exhaustive: never = patch;
          throw new Error(
            `unhandled patch kind: ${JSON.stringify(_exhaustive)}`,
          );
        }
      }
    }
  });
});
