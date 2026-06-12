import { describe, expect, it } from "vitest";

import {
  normalizeDesktopPath,
  normalizeManagedDesktopPath,
} from "@/tauri/io/PathUtils.ts";

describe("normalizeManagedDesktopPath", () => {
  it("normalizes managed storage paths without changing their semantics", () => {
    expect(
      normalizeManagedDesktopPath("C:\\Users\\NAME\\app\\projects\\demo\\"),
    ).toBe("C:/Users/NAME/app/projects/demo");
  });
});

describe("normalizeDesktopPath", () => {
  it("normalizes Windows drive-letter paths without adding a leading slash", () => {
    expect(
      normalizeDesktopPath(
        String.raw`C:\Users\NAME\AppData\Local\app\projects\demo`,
      ),
    ).toBe("C:/Users/NAME/AppData/Local/app/projects/demo");
  });

  it("preserves UNC prefixes while normalizing separators", () => {
    expect(normalizeDesktopPath("\\\\server\\share\\projects\\demo\\")).toBe(
      "//server/share/projects/demo",
    );
  });
});
