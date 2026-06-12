// mirrorPatchProducer.test.ts
//
// Tests the pure patch-derivation (`patchesForCommit`) and the result router's
// stale-result defence — the two halves of the main-side mirror seam that don't
// need a clock. The producer's tokenization is exercised through real commit
// events built from fixtures.

import { makeBook, makeChapter } from "@tests/helpers/workspaceFixtures.ts";
import { describe, expect, it, vi } from "vitest";

import { patchesForCommit } from "@/app/domain/editor/pipelines/mirrorPatchProducer.ts";
import { makeMirrorResultRouter } from "@/app/domain/editor/pipelines/mirrorResultRouter.ts";
import { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
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
