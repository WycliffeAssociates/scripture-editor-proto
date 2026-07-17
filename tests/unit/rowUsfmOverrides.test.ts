import { describe, expect, it } from "vitest";

import {
  getRowUsfmOverrideKey,
  resolveRowUsfmMode,
  toggleRowUsfmOverride,
} from "@/app/ui/components/blocks/DiffModal/rowUsfmOverrides.ts";

describe("rowUsfmOverrides", () => {
  it("uses the decision-unit id for row identity", () => {
    expect(getRowUsfmOverrideKey({ id: "GEN 1:2::22" })).toBe("GEN 1:2::22");
  });

  it("falls back to global showUsfm when no override exists", () => {
    expect(
      resolveRowUsfmMode({
        globalShowUsfmMarkers: false,
        overrides: {},
        rowKey: "k1",
      }),
    ).toBe(false);
    expect(
      resolveRowUsfmMode({
        globalShowUsfmMarkers: true,
        overrides: {},
        rowKey: "k1",
      }),
    ).toBe(true);
  });

  it("toggles local override based on effective current value", () => {
    const first = toggleRowUsfmOverride({
      globalShowUsfmMarkers: false,
      overrides: {},
      rowKey: "k1",
    });
    expect(first.k1).toBe(true);

    const second = toggleRowUsfmOverride({
      globalShowUsfmMarkers: false,
      overrides: first,
      rowKey: "k1",
    });
    expect(second.k1).toBe(false);
  });
});
