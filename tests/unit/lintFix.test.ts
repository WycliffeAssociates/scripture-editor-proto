import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyLintFixToFile } from "@/app/domain/editor/annotations/decorators/lintFix.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

function makeScriptureBookState(): ScriptureBookState {
  return {
    path: "/tmp/GEN.usfm",
    title: "Genesis",
    bookCode: "GEN",
    nextBookId: null,
    prevBookId: null,
    chapters: [
      {
        chapterNumber: 1,
        dirty: false,
        eol: "\n",
        direction: "ltr",
        sourceTokens: [],
        currentTokens: [
          {
            id: "tok-1",
            kind: "text",
            source: "one",
            sid: "GEN 1:1",
          },
        ],
      },
      {
        chapterNumber: 2,
        dirty: false,
        eol: "\n",
        direction: "ltr",
        sourceTokens: [],
        currentTokens: [
          {
            id: "tok-2",
            kind: "text",
            source: "two",
            sid: "GEN 2:1",
          },
        ],
      },
    ],
  };
}

function makeIssue(overrides: Partial<LintIssue> = {}): LintIssue {
  return {
    code: "missing-space" as LintIssue["code"],
    category: "structure",
    severity: "warning",
    issueType: "usfm",
    template: "Missing space",
    message: "Missing space",
    messageParams: {},
    span: { start: 0, end: 1 },
    tokenId: "tok-2",
    sid: "GEN 2:1",
    fix: {
      type: "replaceToken",
      code: "missing-space",
      label: "Fix",
      labelParams: {},
      targetTokenId: "tok-2",
      replacements: [
        {
          kind: "text",
          text: "fixed",
          sid: "GEN 2:1",
        },
      ],
    },
    ...overrides,
  };
}

function makeService(args?: {
  applyTokenFixes?: ReturnType<typeof vi.fn>;
  lintScope?: ReturnType<typeof vi.fn>;
}): IUsfmOnionService {
  return {
    supportsPathIo: false,
    applyTokenFixes:
      args?.applyTokenFixes ??
      vi.fn(async () => ({
        tokens: [
          {
            id: "tok-2",
            kind: "text",
            source: "fixed",
            sid: "GEN 2:1",
            span: { start: 0, end: 5 },
          },
        ],
        appliedChanges: [
          {
            kind: "replaceToken",
            code: "missing-space",
            label: "Fix",
            labelParams: {},
            targetTokenId: "tok-2",
          },
        ],
        skippedChanges: [],
      })),
    lintScope: args?.lintScope ?? vi.fn(async () => [[makeIssue()]]),
  } as unknown as IUsfmOnionService;
}

// applyLintFixToFile is COMPUTE-ONLY per the withWorkingFilesDraft contract: it
// reads the book it's handed and returns the rebuilt USFM (no store writes, no
// rebuild). The checkout + rebuild, diff/lint refresh, editor sync, and success
// toast live in the hook's mutate + post-commit follow-through (so a stale/gate
// abort can't publish "fix applied" for a write that didn't land). These tests
// pin the compute contract; the commit ordering is guaranteed by
// workingFileCommand.test.ts.
describe("applyLintFixToFile (compute)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes a fix and reports applied:true with rebuilt USFM", async () => {
    const file = makeScriptureBookState();
    const service = makeService({ lintScope: vi.fn(async () => [[]]) });
    const fix = makeIssue().fix;
    if (!fix) throw new Error("Fix is required");

    const result = await applyLintFixToFile({
      err: makeIssue(),
      issueFix: fix,
      file,
      targetBookCode: "GEN",
      targetChapterNumber: 2,
      usfmOnionService: service,
    });

    expect(result.applied).toBe(true);
    if (result.applied) expect(typeof result.nextUsfm).toBe("string");
    // No fallback relint needed when the fix anchors on the first try.
    expect(result.fallbackIssues).toBeUndefined();
    expect(service.applyTokenFixes).toHaveBeenCalledTimes(1);
  });

  it("re-lints once and retries when the original fix no longer anchors, surfacing fallbackIssues", async () => {
    const file = makeScriptureBookState();
    const applyTokenFixes = vi
      .fn()
      .mockResolvedValueOnce({
        tokens: [],
        appliedChanges: [],
        skippedChanges: [],
      })
      .mockResolvedValueOnce({
        tokens: [
          {
            id: "tok-2b",
            kind: "text",
            source: "fixed",
            sid: "GEN 2:1",
            span: { start: 0, end: 5 },
          },
        ],
        appliedChanges: [
          {
            kind: "replaceToken",
            code: "missing-space",
            label: "Fix",
            labelParams: {},
            targetTokenId: "tok-2b",
          },
        ],
        skippedChanges: [],
      });
    const normalizedIssue = makeIssue({
      sid: "GEN 2:1-2",
      message: "Missing space",
      span: { start: 3, end: 4 },
      tokenId: "tok-2b",
      fix: {
        type: "replaceToken",
        code: "missing-space",
        label: "Fix",
        labelParams: {},
        targetTokenId: "tok-2b",
        replacements: [
          {
            kind: "text",
            text: "fixed",
            sid: "GEN 2:1",
          },
        ],
      },
    });
    const lintScope = vi.fn().mockResolvedValueOnce([[normalizedIssue]]);
    const service = makeService({ applyTokenFixes, lintScope });

    const fix = makeIssue().fix;
    if (!fix) throw new Error("Fix is required");

    const result = await applyLintFixToFile({
      err: makeIssue(),
      issueFix: fix,
      file,
      targetBookCode: "GEN",
      targetChapterNumber: 2,
      usfmOnionService: service,
    });

    expect(result.applied).toBe(true);
    expect(applyTokenFixes).toHaveBeenCalledTimes(2);
    // The fallback relint is surfaced (compute only) so the hook can refresh
    // the lint panel — it is NOT committed inside this function.
    expect(result.fallbackIssues).toEqual([normalizedIssue]);
  });

  it("reports applied:false when retry still cannot apply", async () => {
    const file = makeScriptureBookState();
    const applyTokenFixes = vi.fn().mockResolvedValue({
      tokens: [],
      appliedChanges: [],
      skippedChanges: [],
    });
    const fallback = [makeIssue({ fix: undefined })];
    const service = makeService({
      applyTokenFixes,
      lintScope: vi.fn(async () => [fallback]),
    });
    const fix = makeIssue().fix;
    if (!fix) throw new Error("Fix is required");

    const result = await applyLintFixToFile({
      err: makeIssue(),
      issueFix: fix,
      file,
      targetBookCode: "GEN",
      targetChapterNumber: 2,
      usfmOnionService: service,
    });

    expect(result.applied).toBe(false);
    // The fallback relint is still surfaced so the no-op path can refresh
    // the lint panel post-transaction.
    expect(result.fallbackIssues).toEqual(fallback);
  });
});
