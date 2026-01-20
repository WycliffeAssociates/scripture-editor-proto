# USFM Editing Modes - Implementation Plan

## Overview

This implementation plan details concrete steps to implement USFM Editing Modes specification defined in `../specs/usfm-editing-modes.md`. The plan is organized by **epics** (high-level features), with each epic detailing:

- Files that need to be modified
- Implementation approach
- Testing strategy
- Edge cases and considerations

## Implementation Epics

### ✅ Epic 1: Cursor Correction
**Status:** Ready to implement
**Scope:** Small, focused feature
**Description:** Ensure cursor is never "trapped" in a locked marker node in Regular mode. Automatically move cursor to nearest editable location.

### ✅ Epic 2: Testing for Cursor Correction
**Status:** Ready to implement
**Scope:** Unit and E2E test coverage
**Description:** Comprehensive tests for cursor correction functionality.

### 🔄 Epic 3: Context Menu Intelligence & Structural Editing
**Status:** **DEFERRED** - Future ticket
**Scope:** Complex, large feature
**Description:** Dynamically populate context menu based on verse structure. Implement structural editing actions (merge verses, convert prose↔poetry, poetry level changes).

**Note:** This epic is intentionally deferred to keep tickets focused and manageable. The spec and implementation outline are complete and ready when this work begins.

---

## Epic 1: Cursor Correction

### Goal

Ensure cursor is never "trapped" in a locked marker node in Regular mode. Automatically move cursor to nearest editable location (forward first, then backward) when in locked node.

### Implementation Approach

**Note:** This is a small feature - just a few helper functions added to `USFMPlugin.tsx` following existing patterns used in `maintainDocumentStructure.ts`.

### Implementation Tasks

#### 1.1 Add Cursor Correction Helper Functions

**Files to Modify:**
- `src/app/domain/editor/plugins/USFMPlugin.tsx`

**Implementation:**

```typescript
// Add these helper functions to USFMPlugin.tsx (after imports, before plugin component)

import { $getSelection, $isRangeSelection } from "lexical";
import { EditorModes } from "@/app/data/editor.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";

// Helper: Check if node is locked
function isNodeLocked(node: LexicalNode): boolean {
    if (!$isUSFMTextNode(node)) return false;
    const tokenType = node.getTokenType();
    return TOKENS_TO_LOCK_FROM_EDITING.has(tokenType);
}

// Helper: Find next editable node (forward traversal)
function findNextEditableNode(node: LexicalNode): USFMTextNode | null {
    let current = node.getNextSibling();
    while (current) {
        if ($isUSFMTextNode(current) && !isNodeLocked(current)) {
            return current as USFMTextNode;
        }
        if ($isUSFMTextNode(current) && isNodeLocked(current)) {
            // Skip locked nodes
            current = current.getNextSibling();
            continue;
        }
        // Handle element nodes (paragraph, etc.) - look for first child
        if ($isElementNode(current)) {
            const firstChild = current.getFirstChild();
            if (firstChild) {
                current = firstChild;
                continue;
            }
        }
        current = current.getNextSibling();
    }
    return null;
}

// Helper: Find previous editable node (backward traversal)
function findPreviousEditableNode(node: LexicalNode): USFMTextNode | null {
    let current = node.getPreviousSibling();
    while (current) {
        if ($isUSFMTextNode(current) && !isNodeLocked(current)) {
            return current as USFMTextNode;
        }
        if ($isUSFMTextNode(current) && isNodeLocked(current)) {
            current = current.getPreviousSibling();
            continue;
        }
        if ($isElementNode(current)) {
            const lastChild = current.getLastChild();
            if (lastChild) {
                current = lastChild;
                continue;
            }
        }
        current = current.getPreviousSibling();
    }
    return null;
}

// Main cursor correction function
function correctCursorIfNeeded(editor: LexicalEditor) {
    editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const { anchorNode, focusNode } = selection;

        // Check if anchor or focus is in a locked node
        const isAnchorInLocked = isNodeLocked(anchorNode);
        const isFocusInLocked = isNodeLocked(focusNode);

        if (isAnchorInLocked || isFocusInLocked) {
            // Try to move forward first (to next non-locked node)
            const nextEditable = findNextEditableNode(anchorNode || focusNode);
            if (nextEditable) {
                editor.update(() => {
                    nextEditable.selectStart();
                });
                return;
            }

            // Try to move backward (to previous non-locked node)
            const prevEditable = findPreviousEditableNode(anchorNode || focusNode);
            if (prevEditable) {
                editor.update(() => {
                    prevEditable.selectEnd();
                });
            }
        }
    });
}
```

#### 1.2 Register Cursor Correction Listener

**Integration:**

Add cursor correction to the `useEffect` in `USFMPlugin.tsx`:

```typescript
useEffect(() => {
    if (mode === EditorModes.SOURCE) {
        console.log("mode === EditorModes.SOURCE");
        // NOOOP NO EFFECTS IN THIS MODE
        return;
    }

    // ... existing listeners (maintainMetadata, lints, etc.) ...

    // NEW: Register update listener for cursor correction
    const cursorCorrectionUnregister = editor.registerUpdateListener(
        ({ editorState, tags }) => {
            // Early exit if not in Regular mode (WYSIWYG)
            if (mode !== EditorModes.WYSIWYG) return;

            // Skip if this was triggered programmatically
            if (tags.has(EDITOR_TAGS_USED.programaticDoRunChanges)) return;

            // Skip if editor is empty
            if (editorState.isEmpty()) return;

            // Check and correct cursor if needed
            correctCursorIfNeeded(editor);
        },
        {
            tag: [EDITOR_TAGS_USED.programaticDoRunChanges],
            skipTransforms: true,
        },
    );

    // Update cleanup
    const cleanup = () => {
        wysiPreview();
        unregisterTransformWhileTyping();
        maintainMetadata();
        debouncedMaintainMetadata();
        redirectParaInsertionToLineBreakUnregister();
        lints();
        keyDownUnregister();
        moveToAdjacentNodesWhenSeemsAppropriateUnregister();
        pasteCommand();
        lockImmutablesOnCut();
        syncRefScrollUnregister();
        cursorCorrectionUnregister(); // NEW
    };

    return cleanup;
}, [mode, markersViewState, editor, markersMutableState, /* ... other deps */]);
```

**Edge Cases:**
1. Cursor at document end (no forward node) → Move backward only
2. Cursor at document start (no backward node) → Move forward only
3. Only locked nodes in document → Do nothing (cursor stays where it is)
4. Empty document → No-op (early exit)
5. Cursor in nested editor (footnote) → Apply same logic within nested editor (if footnote has its own plugin instance)

**Dependencies:**
- `src/app/data/editor.ts` - EditorModes, TOKENS_TO_LOCK_FROM_EDITING
- `src/app/domain/editor/nodes/USFMTextNode.ts` - $isUSFMTextNode helper

**Complexity:**
- Low
- Helper functions are straightforward traversal
- Follows existing patterns from `maintainDocumentStructure.ts`

---

## Epic 2: Testing for Cursor Correction

### Goal

Ensure comprehensive test coverage for cursor correction feature. Follow TDD principles - write failing tests first, then implement.

### Test Structure

**Directory Structure:**

```
src/test/
├── unit/
│   ├── cursorCorrection.test.ts (NEW)
│   └── (existing test files...)
└── e2e/
    └── (existing E2E tests...)
```

### Test Priorities

1. **Critical Path Tests** - Test happy path for each feature
2. **Edge Case Tests** - Test boundaries, empty states, nested structures
3. **Mode-Specific Tests** - Test behaviors in Regular, USFM, and Raw modes
4. **Regression Tests** - Ensure existing features still work

### Test Infrastructure

**Test Helpers Needed:**

For unit tests, we'll need test helper functions (create if not existing):

```typescript
// src/test/helpers/testEditor.ts (if not already exists)

import { createEditor } from "lexical";
import { $getRoot } from "lexical";
import { parseUSFMChapter } from "@/core/data/usfm/parse.ts";
import { parsedUsfmTokensToJsonLexicalNode } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";

export function createTestEditor(usfmContent: string) {
    const editor = createEditor({
        nodes: [],
    });

    // Parse USFM and set editor state
    const tokens = parseUSFMChapter(usfmContent, "GEN");
    const serialized = parsedUsfmTokensToJsonLexicalNode(tokens, "ltr");

    editor.setEditorState(editor.parseEditorState(serialized));
    return editor;
}

export function getEditorTextContent(editor: LexicalEditor): string {
    return editor.getEditorState().read(() => {
        const root = $getRoot();
        return root.getTextContent();
    });
}
```

Check if `src/test/helpers/testEditor.ts` or similar test infrastructure already exists in codebase. If so, reuse it. If not, create it.

### Test Cases

```typescript
// Test file: src/test/unit/cursorCorrection.test.ts (create new)

import { createTestEditor } from "../helpers/testEditor";

describe("cursorCorrection", () => {
    it("should move cursor from locked marker to verse number", () => {
        const editor = createTestEditor("\\v 1 text");
        // Navigate cursor to be on \\v marker
        const selection = editor.getEditorState().read(() => $getSelection());
        // Simulate selection being on locked node
        // Expect: Cursor moves to verse number "1"
        expect(selection.anchor.getNode().getTextContent()).toBe("1");
    });

    it("should move cursor backward if no forward editable node", () => {
        const editor = createTestEditor("\\v 1 Last verse");
        // Navigate to end of text
        // Expect: Cursor moves to "1" if on locked marker, or to text if not
        const selection = editor.getEditorState().read(() => $getSelection());
        // Verify cursor is in editable position
        expect(selection).toBeDefined();
    });

    it("should not move cursor if already in editable node", () => {
        const editor = createTestEditor("\\v 1 text content");
        // Navigate cursor into "text content"
        const selection = editor.getEditorState().read(() => $getSelection());
        const initialNode = selection.anchor.getNode();
        // Trigger cursor correction
        correctCursorIfNeeded(editor);
        // Expect: Cursor stays in place
        const newSelection = editor.getEditorState().read(() => $getSelection());
        expect(newSelection.anchor.getKey()).toBe(initialNode.getKey());
    });

    it("should not run in USFM mode", () => {
        const editor = createTestEditor("\\v 1 text");
        // Set mode to USFM (markersViewState = always, markersMutableState = mutable)
        // Trigger cursor correction
        correctCursorIfNeeded(editor);
        // Expect: No cursor movement even on locked node
        const selection = editor.getEditorState().read(() => $getSelection());
        expect(selection.anchor.getNode().getTextContent()).toContain("\\v");
    });

    it("should not run in Raw/Source mode", () => {
        const editor = createTestEditor("\\v 1 text");
        // Set mode to Raw/Source
        // Trigger cursor correction
        correctCursorIfNeeded(editor);
        // Expect: No cursor movement
        const selection = editor.getEditorState().read(() => $getSelection());
        // Verify no change
    });

    it("should handle cursor in empty document", () => {
        const editor = createTestEditor("");
        // Trigger cursor correction
        correctCursorIfNeeded(editor);
        // Expect: No errors, no-op
        expect(() => {}).not.toThrow();
    });

    it("should handle cursor at document end", () => {
        const editor = createTestEditor("\\v 1 Last verse");
        // Navigate to end of last node
        // Expect: Cursor moves backward instead of forward
        const selection = editor.getEditorState().read(() => $getSelection());
        // Verify backward movement
    });

    it("should handle cursor at document start", () => {
        const editor = createTestEditor("\\v 1 First verse");
        // Navigate to start of first node
        // Expect: Cursor moves forward instead of backward
        const selection = editor.getEditorState().read(() => $getSelection());
        // Verify forward movement
    });
});
```

**Dependencies:**
- Test helpers (create or reuse existing)
- Editor state utilities

**Complexity:**
- Low to Medium
- Tests are straightforward assertions
- Need to mock editor state and navigation

---

## Epic 3: Context Menu Intelligence & Structural Editing

### Status: **DEFERRED** - Future Ticket

### Goal

Dynamically populate context menu based on right-clicked node's context using editor traversal to understand verse structure. Show structural editing actions (merge verses, convert prose↔poetry, poetry level changes).

### Reason for Deferral

- **Complexity:** This is a large, complex feature involving:
  - Context detection via editor traversal
  - Multiple structural editing functions (merge, convert, poetry level changes)
  - Careful node manipulation and state preservation
  - i18n for all actions

- **Ticket Focus:** Keeping this as a separate ticket allows:
  - Cursor correction to be implemented and tested independently
  - Smaller, more manageable tickets
  - Better isolation of concerns

- **Readiness:** The specification (`specs/usfm-editing-modes.md`) and implementation outline are complete. This epic is ready to begin when resources are available.

### Implementation Outline (For Future Reference)

**When this epic is implemented, it will include:**

#### 3.1 Context Detection
- Create `src/app/domain/editor/utils/verseContext.ts`
- Use `editor.read()` traversal to determine verse context
- Detect verse type (prose/poetry/introduction)
- Detect poetry level (1/2/3)
- Detect first/last/empty verse status

#### 3.2 Structural Editing Actions
- Create `src/app/domain/editor/listeners/contextMenuActions.ts`
- Implement: `mergeWithPreviousVerse()`
- Implement: `mergeWithNextVerse()`
- Implement: `convertToProse()`
- Implement: `convertToPoetry()`
- Implement: `changePoetryLevel()`
- Implement: `deleteVerse()`
- All actions will be stubs initially (log to console), then fully implemented

#### 3.3 Context Menu Integration
- Update `src/app/domain/editor/plugins/ContextMenuPlugin.tsx`
- Use `getVerseContext()` to determine available actions
- Dynamically show/hide actions based on context
- Integrate with existing marker insertion actions

#### 3.4 Testing
- Unit tests for `getVerseContext()`
- Unit tests for structural editing actions
- E2E tests for context menu behavior
- Tests for mode-specific behavior

**Dependencies:**
- `src/app/domain/editor/nodes/USFMTextNode.ts` - $isUSFMTextNode, getInPara
- `src/app/data/editor.ts` - UsfmTokenTypes
- `src/app/ui/i18n/` - i18n keys for action labels

**Complexity:**
- Medium to High
- Context detection requires editor traversal and understanding of structure
- Structural editing requires careful node manipulation
- Need to preserve all text, markers, SIDs correctly

---

## Summary of Changes

### Epic 1: Cursor Correction

**Files to Modify:**
- `src/app/domain/editor/plugins/USFMPlugin.tsx` - Add cursor correction helper functions and listener

**Files NOT Modified:**
- CSS files (already implemented)
- ContextMenuPlugin.tsx (deferred to Epic 3)

### Epic 2: Testing

**Files to Create:**
- `src/test/unit/cursorCorrection.test.ts` - Tests for cursor correction
- `src/test/helpers/testEditor.ts` - Test helper functions (if not exists)

**Dependencies:**
- Lexical API
- Existing USFM node types
- Existing patterns from `maintainDocumentStructure.ts`

### Epic 3: Context Menu & Structural Editing

**Status: DEFERRED**
**No files created or modified in this ticket.**

---

## Implementation Order

### Phase 1: TDD - Write Failing Tests
- Create test helper functions if needed
- Write unit tests for cursor correction
- All tests should fail initially

### Phase 2: Implement Cursor Correction
- Add helper functions to `USFMPlugin.tsx`
- Register cursor correction listener in `useEffect`
- Add to cleanup function

### Phase 3: Make Tests Pass
- Run unit tests
- Fix any failing tests
- Ensure all edge cases covered

### Phase 4: Manual Verification
- Test in browser with real editor
- Test in different modes (Regular, USFM, Raw)
- Test edge cases (document boundaries, empty document)
- Performance test with large chapters

### Phase 5 (Future): Structural Editing Epic
- When Epic 3 is implemented:
  - Write tests for context detection
  - Implement context detection
  - Write tests for structural actions
  - Implement structural actions (stubs first, then full)
  - Integrate with context menu

---

## Implementation Philosophy

### Focused, Small Epic
- Cursor correction is a focused, small feature
- Just a few helper functions added to USFMPlugin
- Follows existing patterns from codebase
- Easy to test and verify

### TDD Approach
- Write failing tests first
- Implement until tests pass
- Ensure behavior is testable and documented

### Code Reuse
- Follow patterns from `maintainDocumentStructure.ts`
- Use existing helpers ($isUSFMTextNode, getTokenType, etc.)
- Leverage existing TOKENS_TO_LOCK_FROM_EDITING set

### Separation of Concerns
- Cursor correction = immediate value, small scope
- Structural editing = complex, separate ticket
- This keeps tickets focused and manageable
- Better for code review and testing

### Future Readiness
- Epic 3 (Context Menu & Structural Editing) has complete specification
- Implementation outline is ready when work begins
- No design decisions needed - just implementation

---

## Notes for Implementation

1. **Cursor Correction Performance**: The listener runs on every update but early exits if not in Regular mode or not in locked node. Should be efficient - O(1) set membership check.

2. **Editor Traversal Pattern**: Uses sibling traversal similar to existing code in `maintainDocumentStructure.ts`. This is a proven pattern that works well.

3. **Testing Existing Behavior**: Before committing, ensure existing tests still pass. No regressions should be introduced.

4. **No i18n Changes**: No i18n changes needed for this ticket (no new UI text).

5. **No CSS Changes**: CSS styling for modes is already implemented. No CSS changes required.

6. **Future Epic Reference**: When Epic 3 is implemented, refer to the "Implementation Outline" section above for detailed implementation plan.

---

## Open Questions / Areas to Clarify

None - This is a focused, small feature with a clear implementation path.
