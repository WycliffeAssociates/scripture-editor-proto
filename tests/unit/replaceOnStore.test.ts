// The store seam of find/replace: a gap target must NEVER touch the store —
// neither the pre-commit refusal nor the in-draft re-check (which guards a
// chapter changing under the replace) may commit anything.

import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  type ReplaceOnStoreDeps,
  replaceMatchOnStore,
} from "@/app/domain/search/replaceOnStore.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { initializeUsfmMarkerCatalog } from "@/core/domain/usfm/onionMarkers.ts";
import { normalizeTokenSids } from "@/core/domain/usfm/tokenSidNormalization.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

const svc = webUsfmOnionService;

beforeAll(async () => {
  initializeUsfmMarkerCatalog(await svc.getMarkerCatalog());
});

const GEN_ND = `\\id GEN
\\c 1
\\v 1 And the \\nd LORD\\nd* said to them plainly.
`;

const GEN_PLAIN = `\\id GEN
\\c 1
\\v 1 And the LORD said to them plainly.
`;

async function loadBook(usfm: string): Promise<ScriptureBookState> {
  const tokens = normalizeTokenSids((await svc.parseUsfm(usfm)).tokens, "GEN");
  return {
    path: "gen.usfm",
    title: "Genesis",
    bookCode: "GEN",
    nextBookId: null,
    prevBookId: null,
    chapters: [
      {
        sourceTokens: tokens,
        currentTokens: tokens,
        direction: "ltr",
        dirty: false,
        chapterNumber: 1,
        eol: "\n",
      },
    ],
  };
}

function makeDeps(store: WorkingFilesStore): ReplaceOnStoreDeps & {
  captureHistory: ReturnType<typeof vi.fn>;
  recordHistory: ReturnType<typeof vi.fn>;
} {
  const captureHistory = vi.fn(() => ({}) as never);
  const recordHistory = vi.fn();
  return {
    workingFilesStore: store,
    interactionGate: new WorkspaceGateStore({ kind: "open" }),
    history: { captureHistory, recordHistory } as unknown as CustomHistoryHook,
    usfmOnionService: svc,
    captureHistory,
    recordHistory,
  };
}

const gapArgs = {
  target: {
    bookCode: "GEN",
    chapterNum: 1,
    sid: "GEN 1:1",
    sidOccurrenceIndex: 0,
  },
  replacement: "Lord spoke",
  searchTerm: "LORD said",
  matchCase: true,
  matchWholeWord: false,
  searchUSFM: false,
};

describe("replaceMatchOnStore gap refusal", () => {
  it("returns gap and leaves the store untouched", async () => {
    const store = new WorkingFilesStore([await loadBook(GEN_ND)]);
    const before = store.read();
    const generationBefore = store.generation();
    const deps = makeDeps(store);

    const outcome = await replaceMatchOnStore({ ...gapArgs, deps });

    expect(outcome).toEqual({ kind: "gap" });
    expect(store.read()).toBe(before);
    expect(store.generation()).toBe(generationBefore);
    // Refused before opening a history transaction.
    expect(deps.captureHistory).not.toHaveBeenCalled();
    expect(deps.recordHistory).not.toHaveBeenCalled();
  });

  it("the in-draft re-check refuses when the chapter turns gapped under the replace", async () => {
    // Pre-check sees a CLEAN span; a commit landing right after the history
    // capture swaps in a version where the same match crosses hidden markup.
    // The draft-side re-resolution must then refuse to commit.
    const store = new WorkingFilesStore([await loadBook(GEN_PLAIN)]);
    const gappedTokens = (await loadBook(GEN_ND)).chapters[0].currentTokens;
    const deps = makeDeps(store);
    deps.captureHistory.mockImplementation(() => {
      const [book] = store.draftWithChapters([
        { bookCode: "GEN", chapterNum: 1 },
      ]);
      const chapter = book.chapters[0];
      chapter.currentTokens = gappedTokens as Token[];
      store.commit({
        patch: { kind: "bulk", files: [book] },
        meta: {
          kind: "programmaticFix",
          scope: { chapters: [{ bookCode: "GEN", chapterNum: 1 }] },
          dirtyTextContent: true,
        },
      });
      return {} as never;
    });

    const outcome = await replaceMatchOnStore({ ...gapArgs, deps });

    expect(outcome).toEqual({ kind: "unchanged" });
    expect(deps.recordHistory).not.toHaveBeenCalled();
    // The injected commit is the only one; the replace added nothing on top.
    expect(store.generation()).toBe(1);
    const chapter = store.read()[0].chapters[0];
    expect(chapter.currentTokens).toBe(gappedTokens);
  });
});
