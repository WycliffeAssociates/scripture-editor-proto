import { i18n } from "@lingui/core";
import { beforeAll, describe, expect, it } from "vitest";

import {
  getLocalizedUsfmMarkerDescription,
  getLocalizedUsfmMarkerLabel,
} from "@/app/ui/i18n/usfmMarkerLocalization.ts";

describe("usfmMarkerLocalization", () => {
  beforeAll(() => {
    i18n.load("en", {});
    i18n.activate("en");
  });

  it("returns shared localized labels for common markers", () => {
    expect(getLocalizedUsfmMarkerLabel("id")).toBe("Book identifiers");
    expect(getLocalizedUsfmMarkerLabel("m")).toBe("Paragraph");
    expect(getLocalizedUsfmMarkerLabel("p")).toBe("Paragraph");
    expect(getLocalizedUsfmMarkerLabel("v")).toBe("Verse");
  });

  it("falls back to the raw marker string for unknown markers", () => {
    expect(getLocalizedUsfmMarkerLabel("abc")).toBe("\\abc");
  });

  it("provides descriptions for frontmatter markers", () => {
    expect(getLocalizedUsfmMarkerDescription("ide")).toContain(
      "Character encoding",
    );
    expect(getLocalizedUsfmMarkerDescription("abc")).toBeNull();
  });
});
