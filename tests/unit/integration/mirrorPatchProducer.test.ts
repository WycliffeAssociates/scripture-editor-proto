// mirrorPatchProducer.test.ts
//
// Tests the pure patch-derivation (`patchesForCommit`) and the result router's
// stale-result defence — the two halves of the main-side mirror seam that don't
// need a clock. The producer's tokenization is exercised through real commit
// events built from fixtures.

import { makeBook, makeChapter } from "@tests/helpers/workspaceFixtures.ts";
import { describe, expect, it, vi } from "vitest";

import {
  awaitInitialFindings,
  patchesForCommit,
} from "@/app/domain/editor/pipelines/mirrorPatchProducer.ts";
import { makeMirrorResultRouter } from "@/app/domain/editor/pipelines/mirrorResultRouter.ts";
import { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type { MirrorCommand } from "@/app/domain/mirror/mirrorProtocol.ts";
import type { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";
import { FindingsStore } from "@/app/state/FindingsStore.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";

const baselineAbsent = () => ({ kind: "absent" }) as const;

describe("patchesForCommit", () => {
  it("emits a baseline + pushChapter for a chapter-scope commit", () => {
    const book = makeBook({
      bookCode: "GEN",
      chapters: [
        makeChapter({ bookCode: "GEN", chapterNumber: 1, text: "hi" }),
      ],
    });
    const event: CommitEvent = {
      meta: {
        kind: "userEdit",
        scope: { chapters: [{ bookCode: "GEN", chapterNum: 1 }] },
        dirtyTextContent: true,
        generation: 7,
      },
      patch: { kind: "bulk", files: [book] },
      snapshot: [book],
    };

    const patches = patchesForCommit(event, baselineAbsent);
    expect(patches.map((p) => p.kind)).toEqual(["pushBaseline", "pushChapter"]);
    expect(patches.every((p) => p.generation === 7)).toBe(true);
  });

  it("emits a fullSync for a project-scope commit", () => {
    const book = makeBook({ bookCode: "GEN" });
    const event: CommitEvent = {
      meta: {
        kind: "import",
        scope: { project: true },
        dirtyTextContent: true,
        generation: 3,
      },
      patch: { kind: "bulk", files: [book] },
      snapshot: [book],
    };

    const patches = patchesForCommit(event, baselineAbsent);
    expect(patches).toHaveLength(1);
    expect(patches[0]!.kind).toBe("fullSync");
  });

  it("emits a syncMeta (not fullSync) for a metadata-only project commit", () => {
    const book = makeBook({
      bookCode: "GEN",
      chapters: [
        makeChapter({ bookCode: "GEN", chapterNumber: 1, text: "hi" }),
      ],
    });
    // The save clean-mark: project scope, no text changed.
    const event: CommitEvent = {
      meta: {
        kind: "metadataOnly",
        action: "saveCleanMark",
        scope: { project: true },
        dirtyTextContent: false,
        generation: 4,
      },
      patch: { kind: "bulk", files: [book] },
      snapshot: [book],
    };

    const patches = patchesForCommit(event, baselineAbsent);
    expect(patches).toHaveLength(1);
    const patch = patches[0]!;
    expect(patch.kind).toBe("syncMeta");
    if (patch.kind === "syncMeta") {
      // Carries flags + baseline, no tokens.
      expect(patch.books).toHaveLength(1);
      expect(patch.books[0]!.chapterDirty).toEqual([
        { chapterNum: 1, dirty: false },
      ]);
      expect(patch.generation).toBe(4);
    }
  });

  it("emits a deleteChapter when a scoped chapter vanished from the snapshot", () => {
    const book = makeBook({
      bookCode: "GEN",
      chapters: [makeChapter({ bookCode: "GEN", chapterNumber: 1 })],
    });
    const event: CommitEvent = {
      meta: {
        kind: "import",
        scope: { chapters: [{ bookCode: "GEN", chapterNum: 2 }] },
        dirtyTextContent: true,
        generation: 9,
      },
      patch: { kind: "bulk", files: [book] },
      snapshot: [book],
    };

    const patches = patchesForCommit(event, baselineAbsent);
    expect(patches.map((p) => p.kind)).toContain("deleteChapter");
  });
});

describe("awaitInitialFindings — the load contract's first pass", () => {
  it("sends requestId-correlated lint + sous at the load generation and resolves on the matching results", async () => {
    const feed = new MirrorFeed();
    const commands: MirrorCommand[] = [];
    // A fake mirror sink that answers each analyze with a matching result.
    feed.addSink({
      pushPatch: () => {},
      sendCommand: (c) => {
        commands.push(c);
        if (c.kind === "analyzeLint") {
          feed.deliverResult({
            kind: "lintResult",
            byBook: { GEN: [] },
            ranAtGeneration: c.generation,
            requestId: c.requestId,
          });
        }
        if (c.kind === "analyzeSous") {
          feed.deliverResult({
            kind: "sousResult",
            byBook: { GEN: { segments: {}, findings: [] } },
            ranAtGeneration: c.generation,
            requestId: c.requestId,
          });
        }
      },
    });

    const findings = await awaitInitialFindings({ feed, generation: 12 });

    expect(commands.map((c) => c.kind)).toEqual(["analyzeLint", "analyzeSous"]);
    for (const command of commands) {
      // `"all"` reads every seeded book; the load generation orders it against
      // any edit that lands while the initial pass is in flight. Each carries a
      // correlation id so this awaiting caller matches its own result.
      expect("scope" in command && command.scope).toBe("all");
      expect(command.generation).toBe(12);
      expect("requestId" in command && command.requestId).toBeTruthy();
    }
    expect(findings.lint).toEqual({ GEN: [] });
    expect(findings.sous).toEqual({ GEN: { segments: {}, findings: [] } });
  });
});

describe("makeMirrorResultRouter — stale-result defence", () => {
  function setup() {
    const feed = new MirrorFeed();
    const findingsStore = new FindingsStore();
    const router = makeMirrorResultRouter({
      feed,
      workingFilesStore: new WorkingFilesStore([]),
      workspaceBaselineStore: new WorkspaceBaselineStore({
        calculateMd5: async (t) => t,
      }),
      findingsStore,
      dirtyBufferStore: {} as DirtyBufferStore,
      workspaceKey: "demo",
    });
    return { feed, findingsStore, router };
  }

  it("drops a lint result older than one already applied", () => {
    const { feed, findingsStore } = setup();
    const commit = vi.spyOn(findingsStore, "commitBookFindings");

    feed.deliverResult({
      kind: "lintResult",
      byBook: { GEN: [] },
      ranAtGeneration: 5,
    });
    expect(commit).toHaveBeenCalledTimes(1);

    // Stale (lower generation) — must be dropped.
    feed.deliverResult({
      kind: "lintResult",
      byBook: { GEN: [] },
      ranAtGeneration: 3,
    });
    expect(commit).toHaveBeenCalledTimes(1);

    // Newer — applied.
    feed.deliverResult({
      kind: "lintResult",
      byBook: { GEN: [] },
      ranAtGeneration: 6,
    });
    expect(commit).toHaveBeenCalledTimes(2);
  });
});
