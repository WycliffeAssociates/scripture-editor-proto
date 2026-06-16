// @vitest-environment jsdom
/**
 * Mode switching is a read-time concern: the store holds mode-independent
 * canonical tokens, so a mode switch must NOT write to the store (the visible
 * chapter re-derives its shape on read). This guards that contract — which also
 * makes the old "clobber a concurrent programmatic commit during mode switch"
 * bug structurally impossible.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { EDITOR_MODES } from "@/app/data/editor.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { useModeSwitching } from "@/app/ui/hooks/useModeSwitching.tsx";

type ModeSwitchingApi = ReturnType<typeof useModeSwitching>;

function makeChapter(markerText: string): ScriptureChapterState {
  return {
    chapterNumber: 1,
    dirty: false,
    eol: "\n",
    direction: "ltr",
    sourceTokens: [
      {
        id: "tok-1",
        kind: "text",
        span: { start: 0, end: markerText.length },
        sid: "GEN 1:1",
        source: markerText,
      },
    ],
    currentTokens: [
      {
        id: "tok-1",
        kind: "text",
        span: { start: 0, end: markerText.length },
        sid: "GEN 1:1",
        source: markerText,
      },
    ],
  };
}

function makeBook(markerText: string): ScriptureBookState {
  return {
    path: "/userData/projects/foo/01-GEN.usfm",
    title: "Genesis",
    bookCode: "GEN",
    nextBookId: null,
    prevBookId: null,
    chapters: [makeChapter(markerText)],
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let api: ModeSwitchingApi | null = null;

type HarnessProps = {
  workingFilesStore: WorkingFilesStore;
  setEditorContent: (
    fileBibleIdentifier: string,
    chapter: number,
    chapterContent: ScriptureChapterState | undefined,
  ) => void;
};

function Harness(props: HarnessProps) {
  api = useModeSwitching({
    workingFilesStore: props.workingFilesStore,
    currentFileBibleIdentifier: "GEN",
    currentChapter: 1,
    appSettings: { editorMode: EDITOR_MODES.regular },
    updateAppSettings: () => {},
    setEditorContent: props.setEditorContent,
  });
  return null;
}

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  if (!g.IS_REACT_ACT_ENVIRONMENT) {
    g.IS_REACT_ACT_ENVIRONMENT = true;
  }
});

beforeEach(() => {
  api = null;
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  if (container) {
    container.remove();
  }
  root = null;
  container = null;
  api = null;
});

describe("useModeSwitching", () => {
  it("does not rewrite the store on a mode switch (tokens are mode-independent)", () => {
    const store = new WorkingFilesStore([makeBook("INITIAL")]);
    const commitSpy = vi.spyOn(store, "commit");
    const setEditorContent = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <Harness
          workingFilesStore={store}
          setEditorContent={setEditorContent}
        />,
      );
    });

    commitSpy.mockClear();

    // Mode is a read-time concern: the store holds mode-independent tokens, so
    // switching modes must NOT commit anything (and so can't clobber a
    // concurrent programmatic commit — the whole class of clobber bug is gone).
    // The visible chapter re-derives its shape via syncEditorToVisibleChapter.
    act(() => {
      api?.setEditorMode(EDITOR_MODES.usfm);
    });

    expect(commitSpy).not.toHaveBeenCalled();
  });
});
