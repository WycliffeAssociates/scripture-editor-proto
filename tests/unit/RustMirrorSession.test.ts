// RustMirrorSession.test.ts
//
// The desktop lint/Galley sink. Covers the routing glue that isn't in the Rust
// mirror (cargo-tested) or the WorkspaceMirror (web): patches → mirror_push_patch,
// analyze → mirror_lint/mirror_galley_analyze with result delivery, the `behind`
// branch → resyncRequest (NOT findings, which would clear the stores), and
// resident-native backup command routing.

import { describe, expect, it, vi } from "vitest";

import { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type { MirrorResult } from "@/app/domain/mirror/mirrorProtocol.ts";
import { RustMirrorSession } from "@/tauri/domain/mirror/RustMirrorSession.ts";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function setup() {
  invokeMock.mockReset();
  const feed = new MirrorFeed();
  const results: MirrorResult[] = [];
  feed.onResult((r) => results.push(r));
  const session = new RustMirrorSession({ feed });
  return { feed, results, session };
}

describe("RustMirrorSession", () => {
  it("forwards a patch as mirror_push_patch", () => {
    const { feed } = setup();
    invokeMock.mockResolvedValue(undefined);
    const patch = {
      kind: "pushChapter" as const,
      ref: { bookCode: "GEN", chapterNum: 1 },
      chapter: { tokens: [], eol: "\n" as const, dirty: true },
      generation: 4,
    };
    feed.pushPatch(patch);
    expect(invokeMock).toHaveBeenCalledWith("mirror_push_patch", { patch });
  });

  it("delivers a lint result back as lintResult", async () => {
    const { feed, results } = setup();
    invokeMock.mockResolvedValue({
      byBook: { GEN: [] },
      ranAtGeneration: 7,
      behind: false,
    });
    feed.sendCommand({ kind: "analyzeLint", generation: 7 });
    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(invokeMock).toHaveBeenCalledWith("mirror_lint", {
      generation: 7,
    });
    expect(results[0]).toMatchObject({
      kind: "lintResult",
      ranAtGeneration: 7,
    });
  });

  it("retries a behind analyze, then delivers once the patch lands", async () => {
    const { feed, results } = setup();
    // First two attempts lose the race; the third sees the patch applied.
    invokeMock
      .mockResolvedValueOnce({ byBook: {}, ranAtGeneration: 9, behind: true })
      .mockResolvedValueOnce({ byBook: {}, ranAtGeneration: 9, behind: true })
      .mockResolvedValueOnce({
        byBook: { GEN: [] },
        ranAtGeneration: 9,
        behind: false,
      })
      // The packed payload is a separate binary IPC response.
      .mockResolvedValueOnce(new ArrayBuffer(0));
    feed.sendCommand({
      kind: "analyzeGalley",
      generation: 9,
      cachePolicy: "none",
    });
    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(invokeMock).toHaveBeenCalledTimes(4);
    expect(results[0]).toMatchObject({
      kind: "galleyResult",
      ranAtGeneration: 9,
    });
  });

  it("falls back to a resyncRequest only after behind retries are exhausted", async () => {
    const { feed, results } = setup();
    // Patch never lands: every attempt is behind.
    invokeMock.mockResolvedValue({
      byBook: {},
      ranAtGeneration: 9,
      behind: true,
    });
    feed.sendCommand({
      kind: "analyzeGalley",
      generation: 9,
      cachePolicy: "none",
    });
    await vi.waitFor(() => expect(results).toHaveLength(1));
    // Initial attempt + the two bounded retries before falling back.
    expect(invokeMock).toHaveBeenCalledTimes(3);
    expect(results[0]).toEqual({ kind: "resyncRequest", lastGeneration: 9 });
  });

  it("delivers native persisted findings before starting fresh analysis", async () => {
    invokeMock.mockReset();
    const feed = new MirrorFeed();
    const results: MirrorResult[] = [];
    feed.onResult((result) => results.push(result));
    new RustMirrorSession({
      feed,
      workspaceKey: "workspace",
      cacheRoot: "/cache",
    });
    invokeMock
      .mockResolvedValueOnce({
        packedId: 1,
        keys: [],
        segments: {},
        cacheState: "persisted",
        expectedIdentity: {
          analysisId: "1",
          targetContextId: "1",
          hasReference: false,
        },
        ranAtGeneration: 4,
        behind: false,
      })
      .mockResolvedValueOnce(new ArrayBuffer(1))
      .mockResolvedValueOnce({
        packedId: 2,
        keys: [],
        segments: {},
        cacheState: "fresh",
        ranAtGeneration: 4,
        behind: false,
      })
      .mockResolvedValueOnce(new ArrayBuffer(2));

    feed.sendCommand({
      kind: "analyzeGalley",
      generation: 4,
      cachePolicy: "restore",
    });

    await vi.waitFor(() => expect(results).toHaveLength(2));
    expect(
      results.map(
        (result) => result.kind === "galleyResult" && result.cacheState,
      ),
    ).toEqual(["persisted", "fresh"]);
    expect(invokeMock.mock.calls.map(([command]) => command)).toEqual([
      "mirror_galley_load",
      "mirror_galley_packed",
      "mirror_galley_analyze",
      "mirror_galley_packed",
    ]);
  });

  it("routes backup commands to the native resident", async () => {
    const feed = new MirrorFeed();
    const results: MirrorResult[] = [];
    feed.onResult((result) => results.push(result));
    new RustMirrorSession({
      feed,
      workspaceKey: "workspace",
      dirtyBufferRoot: "/backups",
    });
    invokeMock.mockResolvedValue({
      bookCode: "GEN",
      cleared: true,
      ranAtGeneration: 1,
    });
    feed.sendCommand({
      kind: "writeBackup",
      bookCode: "GEN",
      appVersion: "1",
      generation: 1,
    });
    feed.sendCommand({ kind: "clearBackup", bookCode: "GEN", generation: 1 });
    await vi.waitFor(() => expect(results).toHaveLength(2));
    expect(invokeMock).toHaveBeenCalledWith("mirror_backup", {
      bookCode: "GEN",
      appVersion: "1",
      generation: 1,
      dirtyBufferRoot: "/backups",
      workspaceKey: "workspace",
      clear: false,
    });
  });
});
