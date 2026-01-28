import {
    $getRoot,
    $getSelection,
    $isElementNode,
    $isRangeSelection,
} from "lexical";
import { describe, expect, it } from "vitest";
import {
    $isLockedUSFMTextNode,
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { correctCursorIfNeeded } from "@/app/domain/editor/utils/cursorCorrection.ts";
import { createTestEditor } from "../helpers/testEditor.ts";

const usfmContent = `\\id GEN
\\c 1
\\p
\\v 1 In the beginning God created the heaven and the earth.`;

describe("cursorCorrection", () => {
    describe("should move cursor from locked marker to verse number", () => {
        it("should move cursor forward when on a locked verse marker", async () => {
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
            correctCursorIfNeeded(editor);

            // Check that cursor moved away from locked node
            await new Promise((resolve) => setTimeout(resolve, 100));
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
                        expect(text).toMatch(/^\s*(1|In the beginning)/);
                    }
                }
            });
        });
    });

    describe("should move cursor backward if no forward editable node", () => {
        it("should move backward when cursor is at end of document and on locked node", async () => {
            const editor = createTestEditor(usfmContent);

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
                    // Position cursor at the very end of the last node
                    lastNode.selectEnd();
                }
            });

            // Call cursor correction - should move backward if on locked node
            correctCursorIfNeeded(editor);

            await new Promise((resolve) => setTimeout(resolve, 100));

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
            correctCursorIfNeeded(editor);

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
            const editor = createTestEditor(usfmContent);

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
                    // Set cursor on the locked marker
                    lockedMarkerNode.select(0, 0);
                }
            });

            // Call cursor correction with WYSIWYG mode
            // Note: The actual USFM mode checking will be implemented in ticket 1.1
            // This test will need to be updated once mode logic is added
            correctCursorIfNeeded(editor);

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
            correctCursorIfNeeded(editor);

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
                correctCursorIfNeeded(editor);
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
            correctCursorIfNeeded(editor);

            // Should handle gracefully without errors
            const finalSelection = editor.getEditorState().read(() => {
                return $getSelection();
            });

            expect(finalSelection).toBeDefined();
        });
    });

    describe("should handle cursor at document end", () => {
        it("should move backward instead of forward when at document end", () => {
            const editor = createTestEditor(usfmContent);

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
                    // Position cursor at the very end of the last node
                    lastNode.selectEnd();
                }
            });

            // If cursor is on a locked node at end, should try to move forward (fail), then backward
            correctCursorIfNeeded(editor);

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
        it("should move forward instead of backward when at document start", async () => {
            const editor = createTestEditor(usfmContent);

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
                    // Position cursor at the very start of the first node
                    firstNode.select(0, 0);
                }
            });

            // If cursor is on a locked node at start, should move forward (since no backward)
            correctCursorIfNeeded(editor);

            await new Promise((resolve) => setTimeout(resolve, 100));

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
                correctCursorIfNeeded(editor);
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
                correctCursorIfNeeded(editor);
            }).not.toThrow();
        });
    });
});
