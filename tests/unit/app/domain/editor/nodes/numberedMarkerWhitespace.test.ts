import { createTestEditor } from "@tests/helpers/testEditor.ts";
import { $getRoot, type LexicalNode } from "lexical";
import { describe, expect, it } from "vitest";

import {
  $isUSFMNumberedMarkerNode,
  registerNumberedMarkerBehaviors,
  type USFMNumberedMarkerNode,
} from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";

const USFM = `\\id GEN
\\c 1
\\p
\\v 1 In the beginning God created the heaven and the earth.`;

function $verse(): USFMNumberedMarkerNode {
  const walk = (node: LexicalNode): USFMNumberedMarkerNode | null => {
    if ($isUSFMNumberedMarkerNode(node) && node.getMarker() === "v")
      return node;
    if ("getChildren" in node) {
      for (const child of (
        node as { getChildren(): LexicalNode[] }
      ).getChildren()) {
        const hit = walk(child);
        if (hit) return hit;
      }
    }
    return null;
  };
  const hit = walk($getRoot());
  if (!hit) throw new Error("no verse");
  return hit;
}

describe("numbered marker whitespace-only content", () => {
  it("collapses a bare delimiter to the empty placeholder", async () => {
    const editor = await createTestEditor(USFM);
    registerNumberedMarkerBehaviors(editor);
    editor.update(
      () => {
        // What a cut of the digits leaves behind.
        $verse().setTextContent(" ").select(1, 1);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($verse().getTextContent()).toBe("");
    });
  });

  it("leaves parked leading whitespace before digits alone", async () => {
    const editor = await createTestEditor(USFM);
    registerNumberedMarkerBehaviors(editor);
    editor.update(
      () => {
        $verse().setTextContent("   7 ");
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($verse().getTextContent()).toBe("   7 ");
    });
  });
});
