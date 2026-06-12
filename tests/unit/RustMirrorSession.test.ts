// RustMirrorSession.test.ts
//
// The desktop lint/sous sink. Covers the routing glue that isn't in the Rust
// mirror (cargo-tested) or the WorkspaceMirror (web): patches → mirror_push_patch,
// analyze → mirror_lint/mirror_sous_analyze with result delivery, the `behind`
// branch → resyncRequest (NOT findings, which would clear the stores), and
// backup commands ignored (they belong to the backup worker sink).

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
    feed.sendCommand({ kind: "analyzeLint", scope: "all", generation: 7 });
    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(invokeMock).toHaveBeenCalledWith("mirror_lint", {
      scope: "all",
      generation: 7,
    });
    expect(results[0]).toMatchObject({
      kind: "lintResult",
      ranAtGeneration: 7,
    });
  });

  it("turns a behind result into a resyncRequest, not findings", async () => {
    const { feed, results } = setup();
    invokeMock.mockResolvedValue({
      byBook: {},
      ranAtGeneration: 9,
      behind: true,
    });
    feed.sendCommand({
      kind: "analyzeSous",
      scope: { books: ["GEN"] },
      generation: 9,
    });
    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(results[0]).toEqual({ kind: "resyncRequest", lastGeneration: 9 });
  });

  it("ignores backup commands (the backup worker owns them)", () => {
    const { feed } = setup();
    feed.sendCommand({
      kind: "writeBackup",
      bookCode: "GEN",
      appVersion: "1",
      generation: 1,
    });
    feed.sendCommand({ kind: "clearBackup", bookCode: "GEN", generation: 1 });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
