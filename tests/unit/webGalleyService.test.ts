import { describe, expect, it, vi } from "vitest";

import { decodeGalleyAnalysis } from "@/app/domain/editor/annotations/decodeGalleyFindings.ts";
import { sousFindingsToFindings } from "@/app/domain/editor/annotations/normalizeFindings.ts";
import { bookSegments } from "@/app/domain/editor/annotations/vrefProjection.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import { WebBraidHost } from "@/web/domain/braid/WebBraidHost.ts";
import { WebGalleyService } from "@/web/domain/sous/WebGalleyService.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

// The web/wasm Galley path projects each verse with onion and returns Galley's
// packed snapshot plus the existing editor segment map. Decode only at the
// main-thread ownership seam used by the result router.
describe("WebGalleyService", () => {
  type ResidentBraidBook = {
    bookCode: string;
    tokens: import("@/core/domain/usfm/usfmOnionTypes.ts").Token[];
    baselineTokens: import("@/core/domain/usfm/usfmOnionTypes.ts").Token[];
    lineEnding: "lf" | "crlf";
  };
  const seedInput = (
    tokens: import("@/core/domain/usfm/usfmOnionTypes.ts").Token[],
  ): ResidentBraidBook[] => [
    { bookCode: "GEN", tokens, baselineTokens: tokens, lineEnding: "lf" },
  ];
  const seedProjection = (
    tokens: import("@/core/domain/usfm/usfmOnionTypes.ts").Token[],
  ) => {
    const braid = new WebBraidHost();
    return braid.seed(seedInput(tokens)).projection!;
  };
  it("keeps the editor's VREF order instead of the lexicographic map order", async () => {
    const usfm =
      "\\id GEN\n\\c 29\n\\p\n\\v 19 First.\n\\v 2 Second.\n\\v 20 Third.\n";
    const { tokens } = await webUsfmOnionService.parseUsfm(usfm);

    const service = new WebGalleyService();
    service.seed(seedProjection(tokens));
    const analysis = await service.analyzePacked();

    expect(analysis.keys).toEqual(["GEN 29:19", "GEN 29:2", "GEN 29:20"]);
  });

  it("projects verses and returns UTF-16 findings over an anomaly", async () => {
    // Double space inside the verse → sous's deterministic
    // excess-horizontal-whitespace rule. "In the" is 6 UTF-16 units, so
    // the doubled space occupies [6, 8).
    const usfm = "\\id GEN\n\\c 1\n\\v 1 In the  beginning God created.\n";
    const { tokens } = await webUsfmOnionService.parseUsfm(usfm);

    const service = new WebGalleyService();
    service.seed(seedProjection(tokens));
    const packed = await service.analyzePacked();
    const result = decodeGalleyAnalysis(packed);

    const whitespace = result.findings.find(
      (finding) => finding.code === "lex.excess-h-whitespace",
    );
    expect(whitespace).toMatchObject({
      sid: "GEN 1:1",
      code: "lex.excess-h-whitespace",
      severity: "warning",
      start: 6,
      end: 8,
    });
    // Binary rule — no score; the JS shape omits it rather than carrying null.
    expect(whitespace?.score).toBeUndefined();
  });

  it("retains reconciled finding identity and metadata across fresh snapshots", async () => {
    const { tokens } = await webUsfmOnionService.parseUsfm(
      "\\id GEN\n\\c 1\n\\v 1 In the  beginning God created.\n",
    );
    const service = new WebGalleyService();
    service.seed(seedProjection(tokens));
    const analysis = await service.analyzePacked();
    const first = decodeGalleyAnalysis(analysis);
    const second = decodeGalleyAnalysis(analysis, first.snapshot);

    expect(second.snapshot.findings).toBe(first.snapshot.findings);
    expect(second.findings).toBe(first.findings);
    expect(second.snapshot.findings[0]).toBe(first.snapshot.findings[0]);
    expect(sousFindingsToFindings(second.findings)).toBe(
      sousFindingsToFindings(first.findings),
    );
  });

  it("does not rewrite the whole-corpus cache for a scoped edit", async () => {
    const fileSystem = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => {}),
      atomicWriteBytes: vi.fn(async () => {}),
    } as unknown as FileSystem;
    const service = new WebGalleyService({
      fileSystem,
      root: "/cache",
      workspaceKey: "workspace",
    });
    const { tokens } = await webUsfmOnionService.parseUsfm(
      "\\id GEN\n\\c 1\n\\v 1 Text.\n",
    );

    service.seed(seedProjection(tokens));
    await service.analyzePacked(undefined, "restore");
    await service.analyzePacked(undefined, "none");
    await service.analyzePacked(undefined, "refresh");

    expect(fileSystem.atomicWriteBytes).toHaveBeenCalledTimes(1);
    expect(fileSystem.exists).toHaveBeenCalledTimes(1);
  });

  it("writes the cache on a cold restore when the corpus file is missing", async () => {
    const fileSystem = {
      exists: vi.fn(async () => false),
      mkdir: vi.fn(async () => {}),
      atomicWriteBytes: vi.fn(async () => {}),
    } as unknown as FileSystem;
    const service = new WebGalleyService({
      fileSystem,
      root: "/cache",
      workspaceKey: "workspace",
    });
    const { tokens } = await webUsfmOnionService.parseUsfm(
      "\\id GEN\n\\c 1\n\\v 1 Text.\n",
    );

    service.seed(seedProjection(tokens));
    await service.analyzePacked(undefined, "restore");

    await vi.waitFor(() =>
      expect(fileSystem.atomicWriteBytes).toHaveBeenCalledTimes(1),
    );
  });

  it("removes a deleted chapter from the resident book projection", async () => {
    const { tokens } = await webUsfmOnionService.parseUsfm(
      "\\id GEN\n\\c 1\n\\v 1 One.\n\\c 2\n\\v 1 Two.\n",
    );
    const service = new WebGalleyService();
    const braid = new WebBraidHost();
    braid.seed(seedInput(tokens));
    service.seed(braid.projection({ kind: "all" }));

    expect((await service.analyzePacked()).keys).toEqual([
      "GEN 1:1",
      "GEN 2:1",
    ]);
    const mutation = braid.removeChapter("GEN", 2);
    expect(service.removeChapter("GEN", mutation.projection)).toBe("changed");
    expect((await service.analyzePacked()).keys).toEqual(["GEN 1:1"]);
  });
});

describe("segment derivation on main", () => {
  // The anchors a content finding resolves through. Derived from the tokens
  // the editor is drawing rather than shipped with an analysis result, so the
  // token ids are by construction the ones in the DOM.
  it("maps each sid to the text tokens carrying it", async () => {
    const usfm = "\\id GEN\n\\c 1\n\\v 1 In the beginning.\n";
    const { tokens } = await webUsfmOnionService.parseUsfm(usfm);

    const segments = bookSegments({
      path: "/GEN.usfm",
      nextBookId: null,
      prevBookId: null,
      title: "Genesis",
      bookCode: "GEN",
      chapters: [
        {
          sourceTokens: tokens,
          currentTokens: tokens,
          direction: "ltr",
          chapterNumber: 1,
          dirty: false,
          eol: "\n",
        },
      ],
    });

    const verse = segments["GEN 1:1"];
    expect(verse?.length).toBeGreaterThan(0);
    expect(verse?.[0]).toMatchObject({
      tokenId: expect.any(String),
      textSpan: { start: expect.any(Number), end: expect.any(Number) },
    });
    // Anchors name tokens the caller handed in — that is the whole contract.
    const ids = new Set(tokens.map((token) => token.id));
    expect(verse?.every((segment) => ids.has(segment.tokenId))).toBe(true);
  });
});
