import { createTestEditor } from "@tests/helpers/testEditor.ts";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $selectAll,
  COMMAND_PRIORITY_EDITOR,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  DELETE_CHARACTER_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { describe, expect, it } from "vitest";

import { registerChapterNumberLock } from "@/app/domain/editor/listeners/chapterNumberLock.ts";
import {
  $isUSFMNumberedMarkerNode,
  type USFMNumberedMarkerNode,
} from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";

const USFM = `\\id GEN
\\c 1
\\p
\\v 1 In the beginning God created the heaven and the earth.
\\v 2 And the earth was without form.`;

/**
 * Headless editors carry no rich-text defaults, so stand in for them: an
 * editor-priority delete that removes the selection, and an insertion that
 * types over it. The lock must win over these.
 */
function registerBaseline(editor: LexicalEditor) {
  editor.registerCommand<boolean>(
    DELETE_CHARACTER_COMMAND,
    (isBackward) => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return false;
      selection.deleteCharacter(isBackward);
      return true;
    },
    COMMAND_PRIORITY_EDITOR,
  );
  editor.registerCommand<string>(
    CONTROLLED_TEXT_INSERTION_COMMAND,
    (text) => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return false;
      selection.insertText(text);
      return true;
    },
    COMMAND_PRIORITY_EDITOR,
  );
}

function $numbered(): USFMNumberedMarkerNode[] {
  const out: USFMNumberedMarkerNode[] = [];
  const walk = (node: LexicalNode) => {
    if ($isUSFMNumberedMarkerNode(node)) out.push(node);
    if ("getChildren" in node) {
      for (const child of (
        node as { getChildren(): LexicalNode[] }
      ).getChildren())
        walk(child);
    }
  };
  walk($getRoot());
  return out;
}

const $chapter = () => $numbered().find((n) => n.getMarker() === "c");
const $verses = () => $numbered().filter((n) => n.getMarker() === "v");

async function setup() {
  const editor = await createTestEditor(USFM);
  registerBaseline(editor);
  registerChapterNumberLock(editor);
  return editor;
}

describe("chapter number lock", () => {
  it("keeps \\c through select-all + delete", async () => {
    const editor = await setup();
    editor.update(
      () => {
        $selectAll();
        editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($chapter()?.getTextContent()).toBe("1");
      expect($verses()).toHaveLength(2);
    });
  });

  it("keeps \\c through select-all + type-over", async () => {
    const editor = await setup();
    editor.update(
      () => {
        $selectAll();
        editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "x");
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($chapter()?.getTextContent()).toBe("1");
      expect($getRoot().getTextContent()).toContain("In the beginning");
    });
  });

  it("refuses to renumber the chapter", async () => {
    const editor = await setup();
    editor.update(
      () => {
        $chapter()?.select(1, 1);
        editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "2");
        editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($chapter()?.getTextContent()).toBe("1");
    });
  });

  it("blocks backspace from the prose edge into \\c", async () => {
    const editor = await setup();
    editor.update(
      () => {
        // Land a text node right after the chapter number so the backspace
        // at offset 0 would eat into it natively.
        const chapter = $chapter();
        if (!chapter) throw new Error("no chapter");
        const verse = $verses()[0];
        const prose = verse.getNextSibling();
        if (!prose) throw new Error("no prose");
        chapter.insertAfter(prose);
        prose.selectStart();
        editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($chapter()?.getTextContent()).toBe("1");
    });
  });

  it("still lets a range that only covers verses be deleted", async () => {
    const editor = await setup();
    editor.update(
      () => {
        const [first, second] = $verses();
        const selection = first.select(0, 0);
        const secondProse = second.getNextSibling();
        if (!secondProse) throw new Error("no prose");
        selection.focus.set(secondProse.getKey(), 3, "text");
        editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($chapter()?.getTextContent()).toBe("1");
      expect($verses()).toHaveLength(0);
    });
  });
});
