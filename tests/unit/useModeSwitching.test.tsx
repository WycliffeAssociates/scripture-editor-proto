// @vitest-environment jsdom
/**
 * Regression guard for the "clobber" scenario the original useModeSwitching
 * code worried about and the comment at lines 174–178 used to warn against:
 *
 *   Producer P (match-formatting / prettify) commits NEW content to the
 *   store for the visible chapter. The mounted editor's state still reflects
 *   the OLD content (it'll catch up on next render). User then triggers a
 *   mode switch.
 *
 *   The legacy code path called `saveCurrentDirtyLexical()` inside the mode
 *   switch, which read the stale editor state and overwrote the store —
 *   clobbering P's pre-staged commit. The mode-switch transform then ran
 *   against the OLD content, losing P's work.
 *
 * The fix (Stage 1C batch 4): mode switch reads from `workingFilesStore.read()`
 * directly. The clobber comment was deleted but no test guarded it. This is
 * that test: the post-switch bulk commit must reflect what was in the store
 * at switch time, not anything else.
 */

import type { SerializedEditorState } from "lexical";
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

import { EDITOR_MODES, UsfmTokenTypes } from "@/app/data/editor.ts";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
  type SetEditorModeOptions,
  useModeSwitching,
} from "@/app/ui/hooks/useModeSwitching.tsx";

type ModeSwitchingApi = ReturnType<typeof useModeSwitching>;

function makeFlatRegularState(markerText: string): SerializedEditorState {
  return {
    root: {
      type: "root",
      version: 1,
      direction: "ltr",
      format: "",
      indent: 0,
      children: [
        {
          type: "usfm-paragraph-node",
          version: 1,
          direction: "ltr",
          format: "",
          indent: 0,
          textFormat: 0,
          textStyle: "",
          id: `para-${markerText}`,
          marker: "p",
          sid: "GEN 1:1",
          isStructuralEmpty: false,
          children: [
            createSerializedUSFMTextNode({
              text: markerText,
              id: `text-${markerText}`,
              sid: "GEN 1:1",
              tokenType: UsfmTokenTypes.text,
            }),
          ],
        } as unknown as Record<string, unknown>,
      ],
    },
  } as unknown as SerializedEditorState;
}

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
    loadedLexicalState: makeFlatRegularState(markerText),
    lexicalState: makeFlatRegularState(markerText),
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

function findText(state: SerializedEditorState): string {
  const collect = (node: Record<string, unknown>): string => {
    if (
      typeof node.text === "string" &&
      !Array.isArray((node as { children?: unknown[] }).children)
    ) {
      return node.text;
    }
    const children = (node as { children?: Record<string, unknown>[] })
      .children;
    if (!children) return "";
    return children.map(collect).join("");
  };
  return collect(state.root as unknown as Record<string, unknown>);
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

describe("useModeSwitching clobber regression", () => {
  it("mode switch transforms from the store snapshot, not from a stale editor flush", () => {
    const initialBooks = [makeBook("INITIAL_EDITOR_STATE")];
    const store = new WorkingFilesStore(initialBooks);
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

    // Simulate the legacy clobber setup: a programmatic producer
    // (match-formatting / prettify) has committed NEW content to the
    // store for the visible chapter while the editor still shows old
    // content. With the legacy code path, the next mode switch would
    // flush the editor and overwrite this commit. We assert it does
    // NOT — the post-mode-switch state must reflect what's in the
    // store right now.
    const programmaticBooks = [makeBook("PROGRAMMATICALLY_STAGED")];
    store.commit({
      patch: { kind: "bulk", files: programmaticBooks },
      meta: {
        kind: "programmaticFix",
        scope: { project: true },
        dirtyTextContent: true,
      },
    });
    commitSpy.mockClear();

    act(() => {
      api?.setEditorMode(
        EDITOR_MODES.usfm,
        undefined,
        undefined as SetEditorModeOptions | undefined,
      );
    });

    expect(commitSpy).toHaveBeenCalledTimes(1);
    const { patch, meta } = commitSpy.mock.calls[0][0];
    expect(meta.kind).toBe("programmaticFix");
    expect(
      "scope" in meta &&
        (meta as { scope: { project?: boolean } }).scope.project,
    ).toBe(true);
    if (patch.kind !== "bulk") {
      throw new Error(
        "expected bulk commit from mode switch; got " + patch.kind,
      );
    }
    const committedChapter = patch.files
      .find((f) => f.bookCode === "GEN")
      ?.chapters.find((c) => c.chapterNumber === 1);
    if (!committedChapter) {
      throw new Error("missing GEN chapter 1 in mode-switch commit");
    }

    // The post-switch state must include the producer's text. If a
    // future regression re-introduces a "flush editor first" step,
    // the editor (which we never wrote PROGRAMMATICALLY_STAGED into)
    // would have clobbered the store and this assertion would fail.
    const committedText = findText(committedChapter.lexicalState);
    expect(committedText).toContain("PROGRAMMATICALLY_STAGED");
    expect(committedText).not.toContain("INITIAL_EDITOR_STATE");

    // setEditorContent must receive the transformed chapter so the
    // mounted editor catches up to the new mode.
    expect(setEditorContent).toHaveBeenCalledTimes(1);
    const [, , editorChapter] = setEditorContent.mock.calls[0];
    expect(editorChapter?.chapterNumber).toBe(1);
    const editorChapterText = findText(
      (editorChapter as ScriptureChapterState).lexicalState,
    );
    expect(editorChapterText).toContain("PROGRAMMATICALLY_STAGED");
  });
});
