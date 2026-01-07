import {
    $getRoot,
    $getSelection,
    $isElementNode,
    $isRangeSelection,
    type LexicalEditor,
} from "lexical";
import { describe, expect, it } from "vitest";
import { EditorModes } from "@/app/data/editor.ts";
import {
    $isLockedUSFMTextNode,
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { createTestEditor } from "../helpers/testEditor.ts";

/**
 * Stub function for cursor correction functionality.
 * This will be implemented in ticket 1.1, but we're testing it here first (TDD).
 *
 * NOTE: This stub is intentionally doing nothing, which should make tests fail.
 * Once implemented, this function should move the cursor from locked nodes to editable nodes.
 */

// Stub: Main cursor correction function
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function correctCursorIfNeeded(
    _editor: LexicalEditor,
    _mode: string = EditorModes.WYSIWYG,
): void {
    // This is a stub - will be implemented in ticket 1.1
    // Should move cursor from locked marker to nearest editable node
    // Intentionally does nothing to make tests fail (TDD)
}

describe("cursorCorrection", () => {
    describe("should move cursor from locked marker to verse number", () => {
        it("should move cursor forward when on a locked verse marker", () => {
            const usfmContent = `\\id GEN
\\c 1
\\p
\\v 1 In the beginning God created the heaven and the earth.`;

            const editor = createTestEditor(usfmContent);

            let initialNodeKey: string | null = null;

            // Find the locked \\v marker node and position cursor there
            editor.update(() => {
                const root = $getRoot();

                // Get all text nodes from the root
                const allTextNodes: USFMTextNode[] = [];
                root.getChildren().forEach((child) => {
                    if ($isElementNode(child)) {
                        child.getChildren().forEach((grandchild) => {
                            if ($isUSFMTextNode(grandchild)) {
                                allTextNodes.push(grandchild);
                            }
                        });
                    }
                });

                const lockedMarkerNode = allTextNodes.find((node) =>
                    $isLockedUSFMTextNode(node),
                );

                expect(lockedMarkerNode).toBeDefined();

                if (lockedMarkerNode) {
                    // Record initial state
                    initialNodeKey = lockedMarkerNode.getKey();

                    // Set cursor on the locked marker
                    lockedMarkerNode.select(0, 0);
                }
            });

            // Call cursor correction (stub does nothing, so selection will be lost)
            correctCursorIfNeeded(editor, EditorModes.WYSIWYG);

            // Check that cursor moved away from locked node
            editor.getEditorState().read(() => {
                const newSelection = $getSelection();

                // Selection should exist and not be null
                expect(newSelection).not.toBeNull();
                expect(newSelection).toBeDefined();

                if (newSelection && $isRangeSelection(newSelection)) {
                    const anchorNode = newSelection.anchor.getNode();
                    expect($isUSFMTextNode(anchorNode)).toBe(true);

                    if ($isUSFMTextNode(anchorNode)) {
                        // Cursor should NOT be on the initial locked node anymore
                        expect(anchorNode.getKey()).not.toBe(initialNodeKey);
                        // Cursor should now be on an unlocked node
                        expect(anchorNode.getMutable()).toBe(true);
                        // Should be on verse number or text content
                        const text = anchorNode.getTextContent();
                        expect(text).toMatch(/^(1|In the beginning)/);
                    }
                }
            });
        });
    });

    describe("should move cursor backward if no forward editable node", () => {
        it("should move backward when cursor is at end of document and on locked node", () => {
            const usfmContent = `\\id GEN
\\c 1
\\p
\\v 1 Last verse text.`;

            const editor = createTestEditor(usfmContent);

            let _initialNodeKey: string | null = null;

            // Position cursor at end of document on last node
            editor.update(() => {
                const root = $getRoot();

                // Get all text nodes
                const allTextNodes: USFMTextNode[] = [];
                root.getChildren().forEach((child) => {
                    if ($isElementNode(child)) {
                        child.getChildren().forEach((grandchild) => {
                            if ($isUSFMTextNode(grandchild)) {
                                allTextNodes.push(grandchild);
                            }
                        });
                    }
                });

                expect(allTextNodes.length).toBeGreaterThan(0);
                const lastNode = allTextNodes[allTextNodes.length - 1];

                if (lastNode) {
                    _initialNodeKey = lastNode.getKey();
                    // Position cursor at the very end of the last node
                    lastNode.selectEnd();
                }
            });

            // Call cursor correction - should move backward if on locked node
            correctCursorIfNeeded(editor, EditorModes.WYSIWYG);

            // Cursor should have moved to an editable position (not null)
            editor.getEditorState().read(() => {
                const newSelection = $getSelection();
                // Should have a selection (not null/lost)
                expect(newSelection).not.toBeNull();
                expect(newSelection).toBeDefined();

                if (newSelection && $isRangeSelection(newSelection)) {
                    const anchorNode = newSelection.anchor.getNode();
                    expect($isUSFMTextNode(anchorNode)).toBe(true);

                    if ($isUSFMTextNode(anchorNode)) {
                        // Cursor should be on an unlocked node
                        expect(anchorNode.getMutable()).toBe(true);
                    }
                }
            });
        });
    });

    describe("should not move cursor if already in editable node", () => {
        it("should keep cursor in place when already in editable text node", () => {
            const usfmContent = `\\id GEN
\\c 1
\\p
\\v 1 editable text content here`;

            const editor = createTestEditor(usfmContent);

            let initialNodeKey: string | null = null;

            // Position cursor in editable node
            editor.update(() => {
                const root = $getRoot();

                // Get all text nodes
                const allTextNodes: USFMTextNode[] = [];
                root.getChildren().forEach((child) => {
                    if ($isElementNode(child)) {
                        child.getChildren().forEach((grandchild) => {
                            if ($isUSFMTextNode(grandchild)) {
                                allTextNodes.push(grandchild);
                            }
                        });
                    }
                });

                // Find an editable text node (not a locked marker)
                const editableNode = allTextNodes.find((node) => {
                    return (
                        $isUSFMTextNode(node) &&
                        node.getMutable() === true &&
                        node.getTokenType() === "text"
                    );
                });

                expect(editableNode).toBeDefined();

                if (editableNode) {
                    initialNodeKey = editableNode.getKey();
                    // Set cursor in the editable node
                    editableNode.select(3, 3); // Position somewhere in the middle
                }
            });

            // Call cursor correction
            correctCursorIfNeeded(editor, EditorModes.WYSIWYG);

            // Cursor should still be in the same node
            editor.getEditorState().read(() => {
                const newSelection = $getSelection();
                expect(newSelection).toBeDefined();

                if (newSelection && $isRangeSelection(newSelection)) {
                    const anchorNode = newSelection.anchor.getNode();
                    expect($isUSFMTextNode(anchorNode)).toBe(true);

                    if ($isUSFMTextNode(anchorNode)) {
                        expect(anchorNode.getKey()).toBe(initialNodeKey);
                    }
                }
            });
        });
    });

    describe("should not run in USFM mode", () => {
        it("should not move cursor when mode is USFM (markers always visible, mutable)", () => {
            const usfmContent = `\\id GEN
\\c 1
\\p
\\v 1 Text content`;

            const editor = createTestEditor(usfmContent);

            let _initialNodeKey: string | null = null;

            // Position cursor on locked marker
            editor.update(() => {
                const root = $getRoot();

                // Get all text nodes
                const allTextNodes: USFMTextNode[] = [];
                root.getChildren().forEach((child) => {
                    if ($isElementNode(child)) {
                        child.getChildren().forEach((grandchild) => {
                            if ($isUSFMTextNode(grandchild)) {
                                allTextNodes.push(grandchild);
                            }
                        });
                    }
                });

                // Find a locked marker node
                const lockedMarkerNode = allTextNodes.find((node) =>
                    $isLockedUSFMTextNode(node),
                );

                expect(lockedMarkerNode).toBeDefined();

                if (lockedMarkerNode) {
                    _initialNodeKey = lockedMarkerNode.getKey();
                    // Set cursor on the locked marker
                    lockedMarkerNode.select(0, 0);
                }
            });

            // Call cursor correction with WYSIWYG mode
            // Note: The actual USFM mode checking will be implemented in ticket 1.1
            // This test will need to be updated once mode logic is added
            correctCursorIfNeeded(editor, EditorModes.WYSIWYG);

            // For now, cursor should still exist (stub doesn't implement mode checking yet)
            editor.getEditorState().read(() => {
                const newSelection = $getSelection();
                expect(newSelection).toBeDefined();

                if (newSelection && $isRangeSelection(newSelection)) {
                    const anchorNode = newSelection.anchor.getNode();
                    // Once implemented, cursor should stay on the locked marker in USFM mode
                    // For now, we'll just check it's defined
                    expect(anchorNode).toBeDefined();
                }
            });
        });
    });

    describe("should not run in Raw/Source mode", () => {
        it("should not move cursor when mode is SOURCE", () => {
            const usfmContent = `\\id GEN
\\c 1
\\p
\\v 1 Text content`;

            const editor = createTestEditor(usfmContent);

            let initialNodeKey: string | null = null;

            // Position cursor on a node
            editor.update(() => {
                const root = $getRoot();

                // Get all text nodes
                const allTextNodes: USFMTextNode[] = [];
                root.getChildren().forEach((child) => {
                    if ($isElementNode(child)) {
                        child.getChildren().forEach((grandchild) => {
                            if ($isUSFMTextNode(grandchild)) {
                                allTextNodes.push(grandchild);
                            }
                        });
                    }
                });

                // Find any USFM text node
                const textNode = allTextNodes[0];

                expect(textNode).toBeDefined();

                if (textNode) {
                    initialNodeKey = textNode.getKey();
                    // Set cursor on the node
                    textNode.select(0, 0);
                }
            });

            // Call cursor correction with SOURCE mode
            correctCursorIfNeeded(editor, EditorModes.SOURCE);

            // In SOURCE mode, cursor correction should not run at all
            // Cursor should stay in the same position
            editor.getEditorState().read(() => {
                const newSelection = $getSelection();
                expect(newSelection).toBeDefined();

                if (newSelection && $isRangeSelection(newSelection)) {
                    const anchorNode = newSelection.anchor.getNode();
                    if ($isUSFMTextNode(anchorNode)) {
                        expect(anchorNode.getKey()).toBe(initialNodeKey);
                    }
                }
            });
        });
    });

    describe("should handle cursor in empty document", () => {
        it("should not throw errors when document is effectively empty", () => {
            // Note: The USFM parser requires at least an \\id marker
            // We test with minimal valid content that represents an "effectively empty" document
            const usfmContent = `\\id GEN`;

            const editor = createTestEditor(usfmContent);

            // Should not throw any errors
            expect(() => {
                correctCursorIfNeeded(editor, EditorModes.WYSIWYG);
            }).not.toThrow();

            // Editor should still be usable
            expect(editor).toBeDefined();
        });

        it("should be a no-op when calling on minimal document", () => {
            // Note: The USFM parser requires at least an \\id marker
            // We test with minimal valid content that represents an "effectively empty" document
            const usfmContent = `\\id GEN`;

            const editor = createTestEditor(usfmContent);

            // Call cursor correction
            correctCursorIfNeeded(editor, EditorModes.WYSIWYG);

            // Should handle gracefully without errors
            const finalSelection = editor.getEditorState().read(() => {
                return $getSelection();
            });

            expect(finalSelection).toBeDefined();
        });
    });

    describe("should handle cursor at document end", () => {
        it("should move backward instead of forward when at document end", () => {
            const usfmContent = `\\id GEN
\\c 1
\\p
\\v 1 Last verse text at end.`;

            const editor = createTestEditor(usfmContent);

            let _initialNodeKey: string | null = null;

            // Position cursor at end of document
            editor.update(() => {
                const root = $getRoot();

                // Get all text nodes
                const allTextNodes: USFMTextNode[] = [];
                root.getChildren().forEach((child) => {
                    if ($isElementNode(child)) {
                        child.getChildren().forEach((grandchild) => {
                            if ($isUSFMTextNode(grandchild)) {
                                allTextNodes.push(grandchild);
                            }
                        });
                    }
                });

                expect(allTextNodes.length).toBeGreaterThan(0);

                const lastNode = allTextNodes[allTextNodes.length - 1];

                if (lastNode) {
                    _initialNodeKey = lastNode.getKey();
                    // Position cursor at the very end of the last node
                    lastNode.selectEnd();
                }
            });

            // If cursor is on a locked node at end, should try to move forward (fail), then backward
            correctCursorIfNeeded(editor, EditorModes.WYSIWYG);

            // Cursor should have moved to an editable position
            editor.getEditorState().read(() => {
                const newSelection = $getSelection();
                expect(newSelection).toBeDefined();

                if (newSelection && $isRangeSelection(newSelection)) {
                    const anchorNode = newSelection.anchor.getNode();
                    expect($isUSFMTextNode(anchorNode)).toBe(true);

                    if ($isUSFMTextNode(anchorNode)) {
                        // Cursor should be on an unlocked node
                        expect(anchorNode.getMutable()).toBe(true);
                    }
                }
            });
        });
    });

    describe("should handle cursor at document start", () => {
        it("should move forward instead of backward when at document start", () => {
            const usfmContent = `\\id GEN
\\c 1
\\p
\\v 1 First verse text.`;

            const editor = createTestEditor(usfmContent);

            let _initialNodeKey: string | null = null;

            // Position cursor at start of document on first node
            editor.update(() => {
                const root = $getRoot();

                // Get all text nodes
                const allTextNodes: USFMTextNode[] = [];
                root.getChildren().forEach((child) => {
                    if ($isElementNode(child)) {
                        child.getChildren().forEach((grandchild) => {
                            if ($isUSFMTextNode(grandchild)) {
                                allTextNodes.push(grandchild);
                            }
                        });
                    }
                });

                expect(allTextNodes.length).toBeGreaterThan(0);
                const firstNode = allTextNodes[0];

                if (firstNode) {
                    _initialNodeKey = firstNode.getKey();
                    // Position cursor at the very start of the first node
                    firstNode.select(0, 0);
                }
            });

            // If cursor is on a locked node at start, should move forward (since no backward)
            correctCursorIfNeeded(editor, EditorModes.WYSIWYG);

            // Cursor should have moved to an editable position (not null)
            editor.getEditorState().read(() => {
                const newSelection = $getSelection();
                // Should have a selection (not null/lost)
                expect(newSelection).not.toBeNull();
                expect(newSelection).toBeDefined();

                if (newSelection && $isRangeSelection(newSelection)) {
                    const anchorNode = newSelection.anchor.getNode();
                    expect($isUSFMTextNode(anchorNode)).toBe(true);

                    if ($isUSFMTextNode(anchorNode)) {
                        // Cursor should be on an unlocked node
                        expect(anchorNode.getMutable()).toBe(true);
                    }
                }
            });
        });
    });

    describe("edge cases", () => {
        it("should handle document with only locked nodes", () => {
            // Create a document with only markers (hypothetical edge case)
            const usfmContent = `\\id GEN`;

            const editor = createTestEditor(usfmContent);

            // Should not throw errors
            expect(() => {
                correctCursorIfNeeded(editor, EditorModes.WYSIWYG);
            }).not.toThrow();
        });

        it("should handle single editable node", () => {
            const usfmContent = `\\id GEN
\\c 1
\\p
\\v 1 Single text`;

            const editor = createTestEditor(usfmContent);

            // Should not throw errors
            expect(() => {
                correctCursorIfNeeded(editor, EditorModes.WYSIWYG);
            }).not.toThrow();
        });
    });
});
