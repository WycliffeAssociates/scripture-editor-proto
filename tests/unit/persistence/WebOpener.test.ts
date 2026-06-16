// @vitest-environment jsdom

import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WebOpener } from "@/web/persistence/WebOpener.ts";

const { zipSyncMock } = vi.hoisted(() => ({
  zipSyncMock: vi.fn((input: Record<string, Uint8Array>) => input),
}));

vi.mock("fflate", () => ({
  zipSync: zipSyncMock,
}));

describe("WebOpener", () => {
  beforeEach(() => {
    zipSyncMock.mockClear();
  });

  it("exports the managed tree without git internals", async () => {
    const fileSystem = new InMemoryFileSystem({
      "/userData/projects/reg/manifest.yaml": "projects: []",
      "/userData/projects/reg/content/usfm.txt": "hello",
      "/userData/projects/reg/.git/config": "[core]",
    });
    const opener = new WebOpener(fileSystem);
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, "appendChild");
    const removeChild = vi.spyOn(document.body, "removeChild");
    const createElement = vi.spyOn(document, "createElement");
    createElement.mockImplementation(((tagName: string) => {
      const element = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        tagName,
      );
      if (tagName === "a") {
        Object.defineProperty(element, "click", {
          value: click,
          configurable: true,
        });
      }
      return element;
    }) as typeof document.createElement);

    await opener.export("/userData/projects/reg");

    expect(zipSyncMock).toHaveBeenCalledTimes(1);
    const zipInput = zipSyncMock.mock.calls[0]?.[0];
    expect(Object.keys(zipInput ?? {})).toContain("/reg/");
    expect(new TextDecoder().decode(zipInput?.["/reg/manifest.yaml"])).toBe(
      "projects: []",
    );
    expect(new TextDecoder().decode(zipInput?.["/reg/content/usfm.txt"])).toBe(
      "hello",
    );
    expect(Object.keys(zipInput ?? {})).not.toContain("/reg/.git/config");
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:mock");

    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    appendChild.mockRestore();
    removeChild.mockRestore();
    createElement.mockRestore();
  });
});
