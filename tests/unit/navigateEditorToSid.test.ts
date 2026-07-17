import type { LexicalEditor } from "lexical";
import { describe, expect, it, vi } from "vitest";

import { navigateEditorToSid } from "@/app/ui/hooks/navigateEditorToSid.ts";
import { scrollToSidInEditor } from "@/app/ui/hooks/useSearchHighlighter.ts";

vi.mock("@/app/ui/hooks/useSearchHighlighter.ts", () => ({
  scrollToSidInEditor: vi.fn(),
}));

const flushMicrotasks = () =>
  new Promise<void>((resolve) => queueMicrotask(() => resolve()));

const fakeEditor = () => ({}) as LexicalEditor;

describe("navigateEditorToSid", () => {
  it("switches to the SID's chapter, then scrolls to it after render", async () => {
    vi.mocked(scrollToSidInEditor).mockClear();
    const editor = fakeEditor();
    const switchBookOrChapter = vi.fn(() => ({}) as never);

    const ok = navigateEditorToSid({
      editorRef: { current: editor },
      switchBookOrChapter,
      sid: "GEN 1:1",
    });

    expect(ok).toBe(true);
    expect(switchBookOrChapter).toHaveBeenCalledWith("GEN", 1);
    // Scroll is deferred to the render tick, not synchronous.
    expect(scrollToSidInEditor).not.toHaveBeenCalled();

    await flushMicrotasks();
    expect(scrollToSidInEditor).toHaveBeenCalledWith(editor, "GEN 1:1");
  });

  it("does not scroll when the chapter cannot be opened (missing book)", async () => {
    vi.mocked(scrollToSidInEditor).mockClear();
    const switchBookOrChapter = vi.fn(() => undefined);

    const ok = navigateEditorToSid({
      editorRef: { current: fakeEditor() },
      switchBookOrChapter,
      sid: "GEN 5:9",
    });

    expect(ok).toBe(false);
    expect(switchBookOrChapter).toHaveBeenCalledWith("GEN", 5);
    await flushMicrotasks();
    expect(scrollToSidInEditor).not.toHaveBeenCalled();
  });

  it("does not switch on an unparseable SID", () => {
    vi.mocked(scrollToSidInEditor).mockClear();
    const switchBookOrChapter = vi.fn(() => ({}) as never);

    const ok = navigateEditorToSid({
      editorRef: { current: fakeEditor() },
      switchBookOrChapter,
      sid: "not-a-sid",
    });

    expect(ok).toBe(false);
    expect(switchBookOrChapter).not.toHaveBeenCalled();
  });

  it("rejects chapter-only and ranged references (no single verse to land on)", () => {
    for (const sid of ["GEN 1", "GEN 1:1-3"]) {
      vi.mocked(scrollToSidInEditor).mockClear();
      const switchBookOrChapter = vi.fn(() => ({}) as never);
      const ok = navigateEditorToSid({
        editorRef: { current: fakeEditor() },
        switchBookOrChapter,
        sid,
      });
      expect(ok, `${sid} should not navigate`).toBe(false);
      expect(
        switchBookOrChapter,
        `${sid} should not switch`,
      ).not.toHaveBeenCalled();
    }
  });
});
