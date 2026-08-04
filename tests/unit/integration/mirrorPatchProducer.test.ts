// mirrorPatchProducer.test.ts
//
// Tests the pure patch-derivation (`patchesForCommit`) and the result router's
// stale-result defence — the two halves of the main-side mirror seam that don't
// need a clock. The producer's tokenization is exercised through real commit
// events built from fixtures.

import { makeBook, makeChapter } from "@tests/helpers/workspaceFixtures.ts";
import type { LintSnapshot } from "usfm-onion-web";
import { describe, expect, it, vi } from "vitest";

import {
  awaitInitialFindings,
  patchesForCommit,
} from "@/app/domain/editor/pipelines/mirrorPatchProducer.ts";
import { makeMirrorResultRouter } from "@/app/domain/editor/pipelines/mirrorResultRouter.ts";
import { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type { HostCommand } from "@/app/domain/mirror/mirrorProtocol.ts";
import { FindingsStore } from "@/app/state/FindingsStore.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

const baselineAbsent = () => ({ kind: "absent" }) as const;

const emptyLintSummary = {
  byCategory: { document: 0, structure: 0, context: 0, numbering: 0 },
  bySeverity: { error: 0, warning: 0 },
  byIssueType: { usfm: 0, content: 0 },
  totalCount: 0,
  suppressedCount: 0,
};

function lintSnapshot(byBook: Record<string, LintIssue[]> = {}): LintSnapshot {
  return {
    snapshotId: "snapshot",
    books: Object.entries(byBook).map(([book, findings]) => ({
      sourceKey: book,
      book,
      sourceHash: "",
      tokenIdentity: "",
      findings,
      summary: emptyLintSummary,
    })),
    summary: emptyLintSummary,
  };
}

function makeLintIssue(overrides: Partial<LintIssue> = {}): LintIssue {
  return {
    message: "msg",
    template: "msg",
    code: "unknown-token",
    category: "structure",
    severity: "warning",
    issueType: "usfm",
    messageParams: {},
    sid: "GEN 1:1",
    tokenId: "n1",
    span: { start: 0, end: 1 },
    ...overrides,
  } as LintIssue;
}

describe("patchesForCommit", () => {
  it("emits only pushChapter for a chapter-scope commit — no baseline restatement", () => {
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

    // A saved baseline moves only at load and on save, and each of those
    // carries it. Restating it here shipped the whole book's saved tokens and
    // forced a host re-ingest on every keystroke.
    const patches = patchesForCommit(event, baselineAbsent);
    expect(patches.map((p) => p.kind)).toEqual(["pushChapter"]);
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

  it("emits a deleteChapter when deletion empties the book", () => {
    const event: CommitEvent = {
      meta: {
        kind: "import",
        scope: { chapters: [{ bookCode: "GEN", chapterNum: 1 }] },
        dirtyTextContent: true,
        generation: 10,
      },
      patch: { kind: "bulk", files: [] },
      snapshot: [],
    };

    expect(patchesForCommit(event, baselineAbsent)).toEqual([
      {
        kind: "deleteChapter",
        ref: { bookCode: "GEN", chapterNum: 1 },
        generation: 10,
      },
    ]);
  });

  it("emits one complete updateBook for a structural book change", () => {
    const book = makeBook({
      bookCode: "GEN",
      chapters: [
        makeChapter({ bookCode: "GEN", chapterNumber: 1, text: "one" }),
        makeChapter({ bookCode: "GEN", chapterNumber: 3, text: "three" }),
      ],
    });
    const event: CommitEvent = {
      meta: {
        kind: "import",
        scope: {
          chapters: [
            { bookCode: "GEN", chapterNum: 1 },
            { bookCode: "GEN", chapterNum: 3 },
          ],
        },
        structuralChanges: { structurallyChangedBookCodes: ["GEN"] },
        dirtyTextContent: true,
        generation: 12,
      },
      patch: { kind: "bulk", files: [book] },
      snapshot: [book],
    };

    const patches = patchesForCommit(event, baselineAbsent);
    expect(patches).toHaveLength(1);
    expect(patches[0]?.kind).toBe("updateBook");
    if (patches[0]?.kind === "updateBook") {
      expect(
        patches[0].book.chapters.map(({ chapterNum }) => chapterNum),
      ).toEqual([1, 3]);
    }
  });

  it("emits removeBook for an explicitly removed book", () => {
    const event: CommitEvent = {
      meta: {
        kind: "import",
        scope: { chapters: [{ bookCode: "MAT", chapterNum: 1 }] },
        structuralChanges: { deletedBookCodes: ["MAT"] },
        dirtyTextContent: true,
        generation: 13,
      },
      patch: { kind: "bulk", files: [] },
      snapshot: [],
    };

    expect(patchesForCommit(event, baselineAbsent)).toEqual([
      { kind: "removeBook", bookCode: "MAT", generation: 13 },
    ]);
  });
});

describe("awaitInitialFindings — the load contract's first pass", () => {
  it("sends requestId-correlated lint + sous at the load generation and resolves on the matching results", async () => {
    const feed = new MirrorFeed();
    const commands: HostCommand[] = [];
    // A fake mirror sink that answers each analyze with a matching result.
    feed.addSink({
      pushPatch: () => {},
      sendCommand: (c) => {
        commands.push(c);
        if (c.kind === "analyzeLint") {
          feed.deliverResult({
            kind: "lintResult",
            snapshot: lintSnapshot({ GEN: [] }),
            ranAtGeneration: c.generation,
            requestId: c.requestId,
          });
        }
        if (c.kind === "analyzeGalley") {
          feed.deliverResult({
            kind: "galleyResult",
            packed: new ArrayBuffer(0),
            keys: [],
            segments: {},
            cacheState: "fresh",
            ranAtGeneration: c.generation,
            requestId: c.requestId,
          });
        }
      },
    });

    const findings = await awaitInitialFindings({
      feed,
      generation: 12,
      reseed: () => {},
    });

    expect(commands.map((c) => c.kind)).toEqual([
      "analyzeLint",
      "analyzeGalley",
    ]);
    for (const command of commands) {
      expect(command).not.toHaveProperty("scope");
      expect(command.generation).toBe(12);
      expect("requestId" in command && command.requestId).toBeTruthy();
    }
    expect(findings.lint).toEqual(new Map([["GEN", []]]));
    expect(findings.sous).toMatchObject({
      packed: new ArrayBuffer(0),
      keys: [],
      segments: {},
      cacheState: "fresh",
    });
  });

  it("recovers a load-time resyncRequest by re-seeding once and re-issuing the pending analyses", async () => {
    // At load no result router is mounted, so a session that answers the first
    // analyze with `resyncRequest` (seed not landed) would hang the loading gate
    // forever. The awaiter must service the resync itself: re-seed, re-issue.
    const feed = new MirrorFeed();
    let seeded = false;
    const analyzeCount = { lint: 0, sous: 0 };
    feed.addSink({
      pushPatch: () => {},
      sendCommand: (c) => {
        if (c.kind === "analyzeLint") {
          analyzeCount.lint++;
          // Before the re-seed both engines report `behind` → resyncRequest at
          // the same generation; after it they answer with real results.
          feed.deliverResult(
            seeded
              ? {
                  kind: "lintResult",
                  snapshot: lintSnapshot({ GEN: [] }),
                  ranAtGeneration: c.generation,
                  requestId: c.requestId,
                }
              : { kind: "resyncRequest", lastGeneration: c.generation },
          );
        }
        if (c.kind === "analyzeGalley") {
          analyzeCount.sous++;
          feed.deliverResult(
            seeded
              ? {
                  kind: "galleyResult",
                  packed: new ArrayBuffer(0),
                  keys: [],
                  segments: {},
                  cacheState: "fresh",
                  ranAtGeneration: c.generation,
                  requestId: c.requestId,
                }
              : { kind: "resyncRequest", lastGeneration: c.generation },
          );
        }
      },
    });

    let reseeds = 0;
    const findings = await awaitInitialFindings({
      feed,
      generation: 7,
      reseed: () => {
        reseeds++;
        seeded = true;
      },
    });

    // The resync burst (one per engine, same generation) coalesces into exactly
    // one re-seed (not one per resyncRequest); the analyses then re-run and
    // resolve with real findings rather than hanging.
    expect(reseeds).toBe(1);
    expect(analyzeCount.lint + analyzeCount.sous).toBeGreaterThanOrEqual(3);
    expect(findings.lint).toEqual(new Map([["GEN", []]]));
    expect(findings.sous).toMatchObject({
      packed: new ArrayBuffer(0),
      keys: [],
      segments: {},
      cacheState: "fresh",
    });
  });

  it("degrades to empty findings (never hangs) when a re-seed still does not land", async () => {
    vi.useFakeTimers();
    try {
      const feed = new MirrorFeed();
      // Every analyze always reports behind → resyncRequest, even after re-seed.
      feed.addSink({
        pushPatch: () => {},
        sendCommand: (c) => {
          if (c.kind === "analyzeLint" || c.kind === "analyzeGalley") {
            feed.deliverResult({
              kind: "resyncRequest",
              lastGeneration: c.generation,
            });
          }
        },
      });

      const pending = awaitInitialFindings({
        feed,
        generation: 3,
        reseed: () => {},
      });
      await vi.runAllTimersAsync();
      const findings = await pending;

      expect(findings).toEqual({ lint: null, sous: null });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("makeMirrorResultRouter — stale-result defence", () => {
  function setup() {
    const feed = new MirrorFeed();
    const findingsStore = new FindingsStore();
    const workingFilesStore = new WorkingFilesStore([]);
    const router = makeMirrorResultRouter({
      feed,
      workingFilesStore,
      workspaceBaselineStore: new WorkspaceBaselineStore({
        calculateMd5: async (t) => t,
      }),
      findingsStore,
    });
    return { feed, findingsStore, router, workingFilesStore };
  }

  it("drops a lint result older than one already applied", () => {
    const { feed, findingsStore } = setup();
    const commit = vi.spyOn(findingsStore, "commitBraidSnapshot");

    feed.deliverResult({
      kind: "lintResult",
      snapshot: lintSnapshot({ GEN: [] }),
      ranAtGeneration: 5,
    });
    expect(commit).toHaveBeenCalledTimes(1);

    // Stale (lower generation) — must be dropped.
    feed.deliverResult({
      kind: "lintResult",
      snapshot: lintSnapshot({ GEN: [] }),
      ranAtGeneration: 3,
    });
    expect(commit).toHaveBeenCalledTimes(1);

    // Newer — applied.
    feed.deliverResult({
      kind: "lintResult",
      snapshot: lintSnapshot({ GEN: [] }),
      ranAtGeneration: 6,
    });
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("drops a first-delivered result older than the current editor generation", () => {
    const { feed, findingsStore, workingFilesStore } = setup();
    const commit = vi.spyOn(findingsStore, "commitBraidSnapshot");

    workingFilesStore.commit({
      patch: { kind: "bulk", files: [] },
      meta: {
        kind: "metadataOnly",
        action: "saveCleanMark",
        scope: { project: true },
        dirtyTextContent: false,
      },
    });

    feed.deliverResult({
      kind: "lintResult",
      snapshot: lintSnapshot({ GEN: [] }),
      ranAtGeneration: 0,
    });

    expect(commit).not.toHaveBeenCalled();
  });

  it("reuses unchanged Braid issues and normalized findings across snapshots", () => {
    const { feed, findingsStore } = setup();
    const issue = makeLintIssue();

    feed.deliverResult({
      kind: "lintResult",
      snapshot: lintSnapshot({ GEN: [issue] }),
      ranAtGeneration: 1,
    });
    const first = findingsStore.chapterFindings("onion", "GEN", 1)[0];

    feed.deliverResult({
      kind: "lintResult",
      snapshot: lintSnapshot({ GEN: [{ ...issue }] }),
      ranAtGeneration: 2,
    });

    expect(findingsStore.chapterFindings("onion", "GEN", 1)[0]).toBe(first);
  });

  it("rejects an invalid persisted Galley result and requests a repair", async () => {
    const feed = new MirrorFeed();
    const commands: HostCommand[] = [];
    feed.addSink({
      pushPatch: () => {},
      sendCommand: (command) => {
        commands.push(command);
        if (command.kind === "analyzeLint") {
          feed.deliverResult({
            kind: "lintResult",
            snapshot: lintSnapshot(),
            ranAtGeneration: command.generation,
            requestId: command.requestId,
          });
        } else if (command.kind === "analyzeGalley") {
          feed.deliverResult({
            kind: "galleyResult",
            packed: new ArrayBuffer(0),
            keys: [],
            segments: {},
            cacheState:
              command.cachePolicy === "restore" ? "persisted" : "fresh",
            expectedIdentity: {
              analysisId: "1",
              targetContextId: "1",
              hasReference: false,
            },
            ranAtGeneration: command.generation,
            requestId: command.requestId,
          });
        }
      },
    });

    await awaitInitialFindings({
      feed,
      generation: 4,
      reseed: () => {},
    });

    const galleyCommands = commands.filter(
      (command): command is Extract<HostCommand, { kind: "analyzeGalley" }> =>
        command.kind === "analyzeGalley",
    );
    expect(galleyCommands.map((command) => command.cachePolicy)).toEqual([
      "restore",
      "refresh",
    ]);
  });
});
