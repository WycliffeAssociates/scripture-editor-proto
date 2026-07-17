import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DiffSkeleton, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import { TauriUsfmOnionService } from "@/tauri/domain/usfm/TauriUsfmOnionService.ts";
import { WebUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const baseline = Object.freeze([
  Object.freeze({
    id: "baseline-1",
    kind: "text",
    source: "before",
    sid: "GEN 1:1",
  }),
]) satisfies readonly Token[];

const current = Object.freeze([
  Object.freeze({
    id: "current-1",
    kind: "text",
    source: "after",
    sid: "GEN 1:1",
  }),
]) satisfies readonly Token[];

describe("WebUsfmOnionService diff projection", () => {
  it("diffs frozen inputs and projects arbitrary decisions through the same seam", async () => {
    const service = new WebUsfmOnionService();
    const skeleton = await service.diffTokens(baseline, current);
    const unit = skeleton.units.find(
      (candidate) => candidate.status !== "unchanged",
    );

    expect(unit).toBeDefined();
    expect(skeleton.slots.some((slot) => slot.unitId === unit?.id)).toBe(true);

    const merged = await service.mergeDiffBlocks(baseline, current, {
      decisions: { [unit?.id ?? ""]: "baseline" },
      defaultSide: "current",
    });
    expect(merged.map((token) => token.source).join("")).toBe("before");
  });

  it("rejects stale unit ids", async () => {
    const service = new WebUsfmOnionService();

    await expect(
      service.mergeDiffBlocks(baseline, current, {
        decisions: { "unknown-unit": "baseline" },
        defaultSide: "current",
      }),
    ).rejects.toThrow("unknown decision unit id: unknown-unit");
  });
});

describe("TauriUsfmOnionService diff projection", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("forwards only token arrays and the merge request to native commands", async () => {
    const service = new TauriUsfmOnionService();
    const skeleton: DiffSkeleton = { slots: [], units: [] };
    invokeMock
      .mockResolvedValueOnce(skeleton)
      .mockResolvedValueOnce([...baseline]);

    await service.diffTokens(baseline, current);
    await service.mergeDiffBlocks(baseline, current, {
      decisions: { unit: "baseline" },
      defaultSide: "current",
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "usfm_onion_diff_tokens", {
      baselineTokens: baseline,
      currentTokens: current,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "usfm_onion_merge_diff_blocks",
      {
        baselineTokens: baseline,
        currentTokens: current,
        request: {
          decisions: { unit: "baseline" },
          defaultSide: "current",
        },
      },
    );
  });
});
