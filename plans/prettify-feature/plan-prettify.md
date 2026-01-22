# Plan: USFM Prettify Feature

## Overview
Add opt-in formatting operations to clean up USFM files at two scopes:
- **Prettify Book**: Formats currently open USFM book/file
- **Prettify Project**: Formats all USFM files in the project

These are **opinionated, destructive operations** that users explicitly trigger, distinct from the automatic maintenance operations in `maintainDocumentStructure.ts`.

## Motivation
Users often work with USFM files from various sources (imports, copy-pasting, other tools) that have inconsistent formatting:
- Extra whitespace within text tokens
- Paragraph markers not on their own lines
- Chapter verse numbers immediately following `\c` markers without line breaks
- Extra spaces after paragraph markers

The prettify operations provide a quick way to normalize formatting across a book or entire project.

## Current State
The codebase already has:
- Extensive **automatic** cleanup in `maintainDocumentStructure.ts` (10+ reactive operations)
- Action registry pattern in `src/app/domain/editor/actions/`
- Workspace-level actions in `useActions.tsx` with mutability toggle pattern
- ParsedFile workspace model: `mutWorkingFilesRef` array with chapters containing `lexicalState`
- USFM ↔ Lexical serialization utilities
- Batch save operations for project files

**Gap:** No manual/opt-in formatting operations for more opinionated cleanup.

## Prettify Operations

All operations run in sequence on each chapter's lexical state:

### 1. Linebreak after chapter number range
**Before:** `\c 34 \v 1 I will bless...`
**After:** `\c 34\n\v 1 I will bless...`

- Insert linebreak node after numberRange nodes that follow `\c` markers
- Applies to all chapter markers in `CHAPTER_VERSE_MARKERS` (c, ca, cp)

### 2. Collapse internal whitespace in text nodes
**Before:** `Lord at all times\n    his praise shall continually be in my mouth`
**After:** `Lord at all times\nhis praise shall continually be in my mouth`

- Replace multiple consecutive spaces with single space within text tokens
- Preserve line breaks (`\n`)
- Collapse trailing spaces (even when not after punctuation) to max 1 space
- Does NOT preserve intentional multiple spacing
- Handles non-breaking spaces and merges adjacent text nodes

### 3. Linebreak before paragraph markers
**Before:** `\v 4 I sought the Lord \p and delivered me...`
**After:** `\v 4 I sought the Lord\n\p and delivered me...`

- Insert linebreak before all markers in `VALID_PARA_MARKERS`
- Includes identification markers (ide, h, toc1-3, etc.)
- Includes introduction markers (imt, is, ip, iq, etc.)
- Includes title/heading markers (mt1-4, s1-5, etc.)
- Includes body paragraph markers (p, m, q1-3, li1-4, etc.)
- Includes poetry markers (q, q1-4, qa, qm, etc.)
- Includes list markers (lh, li1-4, lim1-4, etc.)
- Includes break markers (pb)

### 4. Linebreak after paragraph markers
**Before:** `\v 4 I sought the Lord\n\p and delivered me...`
**After:** `\v 4 I sought the Lord\n\p\nand delivered me...`

- Ensure all `VALID_PARA_MARKERS` are on their own lines
- Insert linebreak after paragraph marker nodes

### 5. Normalize spacing after paragraph markers
**Before:** `\p     and delivered me from all my fears.`
**After:** `\p and delivered me from all my fears.`

- Reduce multiple spaces between paragraph marker and content to single space
- Applies to all `VALID_PARA_MARKERS`
- Does NOT affect verse/chapter number ranges (preserves `\v 1 ` vs `\p text`)

## Architecture Pattern

**Reduce/Pipe Pattern**:

To maintain performance and simplicity, Prettify operations use a **Reduce/Pipe** pattern on `SerializedLexicalNode` objects:
- **Direct Manipulation**: Instead of spinning up Lexical editor instances (which is heavy), we transform the JSON-serialized state directly.
- **Recursive Pipeline**: A `prettifySerializedNode` function recursively traverses the node tree, applying a pipeline of transformation functions.
- **Extensibility**: New formatting rules can be added by simply inserting a new function into the pipeline.

**Key characteristics:**
- Operates on `SerializedLexicalNode` directly (not creating temporary Lexical editors)
- Uses recursive traversal pattern
- Simple object spreading for updates
- Transform functions can return single node or array (for insertions/deletions)
- Pure transformation pipeline: input → transform → output

## Scopes

### Scope A: Prettify Book
- **Trigger**: Context menu action (Ctrl/Cmd + K) → "Prettify Book"
- **Target**: Currently open book
- **Processing**: All chapters in the selected book
- **Updates**: Marks chapters as `dirty: true`

### Scope B: Prettify Project
- **Trigger**: Toolbar button (FileStack icon) → "Prettify Project"
- **Target**: All books in project (`mutWorkingFilesRef`)
- **Processing**: All chapters across all books
- **Updates**: Marks chapters as `dirty: true`

## Undo & Revert Logic
Since these operations can be destructive across many files:
- **Cloning**: Before any transformation, the entire `mutWorkingFilesRef` is deep-cloned.
- **Review**: Changes are marked as `dirty`, triggering the "Save & Review Changes" modal (DiffModal).
- **Revert All**: A "Revert all changes" button in the DiffModal allows users to restore the project to the pre-cloned state, effectively undoing the entire Prettify operation.

## Implementation Details
- **Core Logic**: `src/app/domain/editor/utils/prettifySerializedNode.ts`
- **Workspace Actions**: `src/app/ui/hooks/useActions.tsx`
- **UI Components**: `Toolbar.tsx`, `DiffModal.tsx`, `ActionPalette.tsx`
- **Tests**: `src/test/integration/prettifyFeature.test.ts`, `src/test/e2e/prettify.spec.ts`

## Decisions Made
- **Undo/Redo**: Use project-level revert via cloning `mutWorkingFilesRef` instead of Lexical's internal undo history.
- **Performance**: Direct JSON manipulation is extremely fast, even for large projects.
- **UI**: Integrated into the existing Save & Review flow to give users confidence before committing changes to disk.
