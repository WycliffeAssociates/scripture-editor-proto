# USFM Editing Modes Specification

## Overview

The Dovetail Scripture Editor supports three distinct editing modes to accommodate different user workflows and technical comfort levels. These modes control how USFM markers are displayed and edited, with the goal of making scripture editing accessible to translators of varying technical backgrounds.

## Core Architecture

The editor mode system is built on three key concepts:

1. **Editor Modes** (`EditorMode`): `wysiwyg` vs `source`
2. **Marker Visibility** (`EditorMarkersViewState`): `always` | `never` | `whenEditing`
3. **Marker Mutability** (`EditorMarkersMutableState`): `mutable` | `immutable`

These settings combine into three user-facing presets:
- **Regular Mode**: Focus on text content, markers locked and hidden
- **USFM Mode**: Full USFM visibility and editing capabilities
- **Raw Mode**: Plain text editor, no structure enforcement

## Mode Definitions

### Regular Mode

**Purpose**: Primary editing mode for translation work. Minimizes technical complexity by hiding markup while maintaining structure.

**Settings Configuration**:
- `mode`: `wysiwyg`
- `markersViewState`: `never`
- `markersMutableState`: `immutable`

**Key Behaviors**:
- USFM markers (`\v`, `\p`, `\q1`, etc.) are **hidden** from the display
- USFM markers are **locked** and cannot be directly edited or deleted
- Verse numbers (`numberRange` token type) remain **visible and editable**
- Cursor is auto-corrected if it enters a locked marker node (see Cursor Behavior section)
- Linting and structure maintenance remain active

**Marker Insertion**:
- Users can insert markers via context menu (right-click or Cmd+K) regardless of current mode
- When inserted in Regular mode, markers immediately become locked and hidden
- Context menu provides common markers: verse, paragraph, poetry levels, chapter labels, etc.
- CSS provides visual feedback during insertion transitions

**Target User**: Tech-hesitant translators focused on content rather than markup.

### USFM Mode

**Purpose**: Structured USFM editing with full visibility of markers. Allows direct manipulation of USFM structure while maintaining validation.

**Settings Configuration**:
- `mode`: `wysiwyg`
- `markersViewState`: `always`
- `markersMutableState`: `mutable`

**Key Behaviors**:
- All USFM markers are **visible** in the editor
- All USFM markers are **mutable** and can be edited freely
- Cursor can navigate freely through all node types (markers, verse numbers, text)
- No auto-correction of cursor position
- Linting and structure maintenance remain active
- Marker typing patterns (e.g., `\v `) trigger node transformation

**Target User**: Translators comfortable with USFM markup who need to adjust structure.

### Raw Mode

**Purpose**: Direct text editing for power users or troubleshooting. Treats USFM as plain text without structure enforcement.

**Settings Configuration**:
- `mode`: `source`
- `markersViewState`: `always`
- `markersMutableState`: `mutable`

**Key Behaviors**:
- No lexical transformation or node structure enforcement
- Users type raw USFM markup directly
- No auto-insertion of missing nodes from linting
- No structure maintenance (maintainDocumentStructure, maintainMetadata, etc.)
- CSS styling differs to indicate raw text mode
- Editor behavior similar to a standard textarea using Lexical

**Target User**: Technical users debugging markup or performing bulk edits.

## Node Locking System

### Locked Node Types

Nodes are locked based on their `tokenType` property. The set `TOKENS_TO_LOCK_FROM_EDITING` defines which node types should be protected from editing:

```typescript
TOKENS_TO_LOCK_FROM_EDITING = {
  TokenMap.idMarker,     // \v, \p, \c markers
  TokenMap.endMarker,     // \v*, \f* closing markers
  TokenMap.implicitClose,  // Implicit closures (e.g., \f without \f*)
  TokenMap.marker,         // Generic marker tokens
}
```

**Key Distinction**: Verse numbers (`numberRange` token type) are **NOT** locked, even in Regular mode. They remain freely editable.

### Node Properties

Each `USFMTextNode` has two key properties:

- `show`: Controls CSS visibility (hidden via `display: none` or `opacity: 0`)
- `isMutable`: Controls whether typing/editing is allowed within the node

These properties are updated when switching modes and are checked by cursor correction listeners.

## Cursor Behavior and Auto-Correction

### Regular Mode Cursor Correction

**Goal**: Ensure cursor is never "trapped" in a locked marker node, preventing the "typing but nothing happens" confusion.

**Implementation**:
- Register a `registerUpdateListener` on the Lexical editor (debounced, ~30-60fps)
- On every update, check if selection's anchor or focus is in a locked node
- Locked nodes are identified by `TOKENS_TO_LOCK_FROM_EDITING` set membership
- If cursor is in locked node, auto-correct to nearest editable location:
  1. Move forward to the next non-locked node (e.g., from `\v` to verse number)
  2. If no forward node exists, move backward to previous non-locked node

**Behavioral Notes**:
- Correction is **seamless and invisible** to the user
- No visual indicators or toasts when correction occurs
- Verse numbers are not locked, so cursor can legitimately rest on them
- Only markers trigger the correction logic

### Typing in Locked Nodes

When typing is attempted while cursor is on a locked node (before correction completes):

- **Block the typing event** - prevent the character from being inserted into the locked node
- **Redirect the character** to the nearest editable node
- Example: If cursor is on hidden `\v` and user types "a", the "a" appears in the verse number or text node

**Backspace at Boundaries**:
Special handling for backspace/delete at verse/chapter boundaries in Regular mode:

- Cursor at start of verse number (after `\v`): Backspace deletes the **linebreak** before `\v`, NOT the `\v` marker itself
- Cursor at end of verse text: Forward delete attempts to delete linebreak after, not the next verse's `\v` marker
- This prevents accidental merging of verses when deleting invisible markers

**Rationale**: Since markers are invisible in Regular mode, deleting them would merge content unexpectedly. Deleting visible structural elements (linebreaks) provides clear visual feedback.

## Chapter Boundaries

### Current Design Philosophy

Chapters (`\c`) are **scaffolded and fixed** - they are the unit of work for navigation and performance. The editor is focused on **revising within chapters**, not managing chapter structure.

**Context**: This is a revision tool. A future pivot may enable drafting capabilities where entire testaments are scaffolded with predefined chapters, but for now chapters are not created/deleted in the editor.

### Editing at Chapter Boundaries

**At Chapter Start** (before first verse):

- **Insert verse**: Cmd+K → Insert verse creates `\v 1` (or appropriate number based on context)
- **Insert paragraph**: Cmd+K → Insert paragraph creates `\p` between `\c` and first verse
- Both actions available, user decides what's needed
- Context menu shows only relevant actions (no "merge with previous verse" at chapter start)

**At Chapter End** (after last verse):

- **Insert verse**: Creates new verse with next verse number (e.g., if last verse is 42, creates `\v 43`)
- Context menu shows "End of Chapter" with no structural merge options
- No option to merge with next chapter (chapters are fixed boundaries)

**Chapter Marker Editing**:

- Chapters are **NOT deletable** via any mode or context menu
- Chapter numbers cannot be edited through the editor interface
- Chapter structure is managed externally (scaffolding, project setup)

### Verse Insertion in Context

Verses can be inserted **anywhere** in the chapter:
- Before first verse (at chapter start)
- Between existing verses
- After last verse (at chapter end)
- In introduction content (between chapter marker and first verse)

## Mode Switching

### Switching Behavior

When user selects a new mode via the segmented control:

1. Only the two underlying settings are updated:
   - `markersViewState` (always/never/whenEditing)
   - `markersMutableState` (mutable/immutable)
2. Cursor position is **preserved** exactly where it was
3. No immediate validation or confirmation dialogs
4. The next frame's `registerUpdateListener` will auto-correct cursor if needed
5. No visual transition indicators

### Frequency Assumption

Mode switches are expected to be **infrequent**. Users typically choose their preferred mode and stick with it throughout their editing session. The system is optimized for this use case rather than rapid mode switching.

### Existing Marker State

When switching from USFM mode (where markers may have been edited) to Regular mode:

- No validation pass is run on mode switch
- Any manual marker modifications are preserved in the editor state
- When `markersMutableState` changes to `immutable`, all matching nodes become locked
- Invalid or malformed markers are handled by the ongoing linting system
- Verse numbers edited to invalid values (e.g., `\v abc`) are flagged by linting

## Context Menu

### Design Philosophy

The context menu (accessed via right-click or Cmd+K) is **simplified** and mode-agnostic. It does not provide granular control over marker visibility or mutability—those settings are managed exclusively via the three modes.

The context menu is **dynamically populated** based on the right-clicked node's context using `SidContentMap` to understand verse structure.

### Available Actions

**Marker Insertion** (available in all modes):
- Insert verse marker (`\v`)
- Insert paragraph marker (`\p`)
- Insert paragraph marker at margin (`\m`)
- Insert chapter label (`\cl`)
- Insert poetry marker (one level) (`\q1`)
- Insert poetry marker (two levels) (`\q2`)
- Insert poetry marker (three levels) (`\q3`)

**Structural Editing Actions** (available in all modes):
- Merge with previous verse
- Merge with next verse
- Convert verse to prose (`\p`)
- Convert verse to poetry (`\q1`)
- Increase poetry level (if applicable)
- Decrease poetry level (if applicable)
- Insert verse before
- Insert verse after

**Control Actions** (NOT available):
- Lock/Unlock markers
- Change markers to always/whenEditing/never visible
- These are managed through the mode toggle only

**Search**:
- Find highlighted text (suggested search term from selection)

### Context Menu Intelligence

The context menu uses `SidContentMap` and node properties to determine which actions to show based on what content is being right-clicked.

**Context Detection**:
- Uses `SidContentMap` to understand the complete verse chunk (starting marker, content, previous verse, next verse)
- Uses `inPara` property on text nodes as flags to determine content type (poetry vs prose)
- Determines verse boundaries and structural context to show relevant actions only

**Principle**: Show only what's helpful in context, augment with search as currently implemented.

### Context Menu Actions by Verse Type

**Prose Verse** (`\v` marker with plain text or `\p` paragraph):
- [ ] Merge with previous verse
- [ ] Merge with next verse
- [ ] Convert to poetry level 1
- [ ] Insert verse before
- [ ] Insert verse after

**Poetry Verse** (`\v` marker with `\q1`/`\q2`/`\q3` lines, detected via `inPara` property):
- [ ] Merge with previous verse
- [ ] Merge with next verse
- [ ] Convert to prose (`\p`)
- [ ] Decrease poetry level (if level > 1)
- [ ] Increase poetry level (if level < 3)
- [ ] Insert verse before
- [ ] Insert verse after

**Paragraph/Introduction** (no `\v` marker, content between chapter and first verse):
- [ ] Insert verse before
- [ ] Insert verse after
- [ ] Convert to poetry (if prose)
- [ ] Convert to paragraph (if poetry)

**Empty Verse** (`\v` marker with no content):
- [ ] Delete verse entirely
- [ ] Merge with adjacent verse (if available)

### Structural Editing Implementation

**Merge with Previous Verse**:
- Takes current verse's content (from verse number to end)
- Appends it to the end of previous verse's text
- Removes current verse's `\v` marker and number
- Preserves all character markers and nested content

**Merge with Next Verse** (inverse of previous):
- Takes next verse's content
- Appends current verse's content to it
- Removes current verse's `\v` marker and number
- Merged verse keeps the next verse's number

**Convert to Poetry/Paragraph**:
- Changes the paragraph marker (`\p` → `\q1` or `\q1` → `\p`)
- Converts all line breaks to appropriate poetry markers or regular line breaks
- Preserves all text content and character markers
- Verse numbers remain intact

**Poetry Level Changes**:
- Changes all `\qX` markers in the current verse to new level
- Maintains line break structure
- Levels are constrained to 1-3 (cannot increase beyond `\q3` or decrease below `\q1`)

### Behavior Across Modes

When inserting a marker via context menu:

- **Regular Mode**: Marker is created with `isMutable: false` and `show: false`. Becomes locked/hidden immediately after insertion.
- **USFM Mode**: Marker is created with `isMutable: true` and `show: true`. Fully editable and visible.
- **Raw Mode**: Marker is created as plain text (no node transformation).

**Visual Feedback**:
- CSS transitions indicate marker insertion
- Undo functionality is preserved across mode changes
- No toast notifications or confirmation dialogs

## Selection and Clipboard Operations

### Copy Behavior

- Copying across locked nodes **preserves full USFM structure**, including markers
- The clipboard contains the complete USFM representation
- When pasted elsewhere, markers are re-parsed and re-created according to the destination's current mode

### Cut Behavior

**Current Implementation** (pragmatic, subject to user testing):
- Cutting across locked nodes is **blocked entirely**
- If selection spans locked and unlocked nodes, cut is prevented
- When cutting only unlocked nodes, text is extracted and copied to clipboard
- Locked nodes remain in the document

**Use Case Consideration**:
- A future enhancement might allow moving entire verses (including `\v` markers) via cut operation
- For now, this is blocked to prevent orphaned markers or invisible content

### Delete Behavior

- Delete operations leave markers present
- Deleting text across verse boundaries will remove the text but preserve the `\v` markers
- This may leave the document in a state with markers present but text removed
- Linting will flag issues (e.g., orphaned `\v` without content)

### Future Refinements

The current clipboard/cut/delete behavior is intentionally pragmatic for initial user testing. Based on feedback, these behaviors may be refined to:

- Allow selective cutting of verses (including their markers)
- Smarter deletion that removes entire marker blocks
- Better handling of orphans after deletion

## Saving and Serialization

### Output Consistency

All three modes **serialize identically** to USFM format. The mode is purely a view/editing concern and does not affect the saved output.

**Behavior**:
- Regardless of current mode, serializer outputs full USFM structure (all markers, all formatting)
- No mode-specific behavior during save/serialization
- Mode is not included in saved USFM content

**Internal Output Formats** (for other tools):
- Verse-per-line format
- Plain text without footnotes
- SID → text map (for reference pane)
- Full USFM with all nested content

These are internal formatting options available to any mode, not mode-specific.

### Validation Before Save

No validation runs specifically on mode switch or save. The linting system operates continuously and identifies issues independently of save operations.

## Undo/Redo Across Mode Switches

### Current Behavior

- Mode switches **clear history operations** in the Lexical history plugin
- This is an acceptable pragmatic approach for current user testing
- Undo/redo stacks are not preserved across mode changes

### Practical Implications

- Users can undo within a mode session
- Switching modes starts a fresh undo history
- Cannot undo back to a state from a different mode
- This aligns with expectation that mode switches are infrequent

### Future Enhancement

A future enhancement may preserve mode state in undo stack:
- When undoing to an edit made in USFM mode, automatically switch back to USFM mode
- Mode becomes part of the undo history
- Requires deeper integration with Lexical's history system

## Character Markers (Text Wrapping)

Character markers (`\wj`, `\add`, `\qt`, etc.) wrap around text ranges rather than standing alone.

### Behavior in Regular Mode

**Content Visibility**:
- Wrapped text (e.g., Jesus' words in `\wj...\wj*`) is **fully visible and editable**
- Opening `\wj` and closing `\wj*` markers are **invisible/locked**
- Users cannot directly tell there's a marker there unless they switch to USFM mode

**Visual Styling**:
- Character marker content is styled via CSS (e.g., italics for words of Jesus)
- Styling is subtle but provides visual cue for special-meaning text
- No icons, pills, or inline indicators for character markers
- Content is distinguished from plain text through typography only

### Deletion of Empty Marker Pairs

**Auto-Cleanup**:
- When a character marker pair becomes empty (only whitespace or no content between `\marker` and `\marker*`), both nodes are automatically removed
- This cleanup runs via transformation listener after content edits
- Prevents orphaned character marker pairs

**Implementation Location**:
- Can be integrated into `inverseTextNodeTransform` or similar cleanup listener
- Runs as part of the existing node transformation pipeline
- Triggers when text node content changes

**Example**:
- User deletes last character inside `\wjJesus\wj*`, leaving `\wj \wj*`
- System detects empty pair and removes both `\wj` and `\wj*` nodes
- Cursor is positioned appropriately after removal

## Poetry Markers

### Behavior in Regular Mode

Poetry markers (`\q1`, `\q2`, `\q3`) control indentation and are locked/hidden in Regular mode.

**Content Visibility**:
- Poetry content remains **fully visible**
- Indentation levels are visible (1, 2, or 3 levels of indentation)
- `\q` markers themselves are **hidden and locked**

**Styling**:
- Poetry styling engine handles indentation to indicate levels
- Each level has distinct indentation (more indentation for higher levels)
- Content is visually distinct from prose through indentation only
- No background, borders, or icons needed for poetry

### Line Breaks in Poetry

**Line Break Behavior**:
- All line breaks in editor are **regular line breaks** (`<br>` or Lexical LineBreakNode)
- Line breaks do NOT automatically insert `\q` markers
- Users never type `\q` directly - it's a structural marker

**Poetry Structure**:
- Poetry level is determined by `\q` marker (`\q1`, `\q2`, `\q3`)
- Multiple lines at same level share the same marker type
- Content wraps to next line, indentation adjusts based on marker level
- If user wants more indentation, they use context menu action "Increase poetry level"

### Context Menu Actions for Poetry

When cursor is in poetry content (detected via `inPara` property on text nodes):

- **Increase poetry level**: Changes `\q1` → `\q2`, `\q2` → `\q3`
- **Decrease poetry level**: Changes `\q2` → `\q1`, `\q3` → `\q2`
- **Convert to prose**: Changes `\qX` to `\p` (paragraph marker)
- Level changes are constrained to valid range (1-3)

### Architectural Note

The `inPara` property on text nodes serves as a flag indicating:
- What type of content contains this text (`\p`, `\q1`, `\q2`, `\q3`)
- This is a tradeoff for flat token architecture
- Eliminates need for complex nested structures
- Allows simple context detection for poetry/prose decisions

## Visual Design and CSS

### Mode Indicator

The primary visual indicator of current mode is the **segmented control** in the settings drawer showing "Regular / Raw / USFM".

### Node Styling

CSS handles the visual distinction between node types:

- **Hidden markers** (Regular mode): Use `display: none` or `opacity: 0`
- **Visible markers** (USFM mode): Styled with appropriate typography (monospace, different color)
- **Verse numbers**: Subtle styling to distinguish from plain text
- **Paragraph markers**: May have pill-shaped background or subtle border

**No Cursor Style Changes**:
- Cursor style (I-beam vs block) is **NOT** used to indicate node types
- Users should not need to understand cursor semantics

**No Hover Tooltips**:
- Hovering over invisible markers does NOT show tooltips
- In Regular mode, markers are truly invisible; no "ghost" indicators

### Transitions

CSS transitions provide smooth feedback when:
- Switching between modes
- Inserting markers (brief flash or fade)
- Auto-correction moves cursor (if visible at all)

The goal is that visual changes are **subtle** and help users understand what's happening without overwhelming them.

## Linting and Validation

### Active in All Modes Except Raw

- **Regular Mode**: Linting active, identifies malformed USFM that users can't see/edit
- **USFM Mode**: Linting active, provides real-time feedback as users edit markers
- **Raw Mode**: No linting or validation (treated as plain text)

### Error Types Detected

The linter catches:
- Missing verse numbers after `\v` markers
- Unclosed character markers (e.g., `\wj` without `\wj*`)
- Orphaned closing markers (e.g., `\f*` without `\f`)
- Invalid chapter or verse numbers
- Missing required markers (e.g., `\c` before `\v`)

### User Notification

Linting errors are surfaced through:
- Inline indicators (red underlines, icons)
- Lint popover panel showing all errors in current chapter
- Error severity levels (warning vs error)

## Verse Number Validation

### Editable Across All Modes

Verse numbers (`\v 1`, `\v 2`, etc.) are **editable** in all three modes:
- **Regular Mode**: Verse numbers are visible and editable (not locked)
- **USFM Mode**: Verse numbers are visible and editable
- **Raw Mode**: Verse numbers are plain text, fully editable

### Validation Approach

Verse number validation is **linting-based**, not enforced at typing time:

- Users can type any content into verse number nodes
- Invalid verse numbers (non-numeric, missing) are flagged by linter
- Red underlines and tooltips indicate validation errors
- No blocking of invalid input at typing time

### Validation Rules

The linter checks:

- **Consecutive verses**: Verses should be numerically sequential (1, 2, 3...)
- Non-consecutive verses are flagged as errors
- Invalid verse numbers (letters, symbols) are flagged
- Missing verse numbers after `\v` markers are flagged

### Verse Range Support

USFM standard supports verse ranges (e.g., `\v 1-3`). Our implementation supports ranges in a **simplified fashion**:

- Ranges are parsed and recognized
- Not 100% compliant with full USFM spec
- Supported sufficiently for common use cases
- Users can create separate verses and merge them if needed

### Invalid Number Handling

When a verse number becomes invalid (e.g., `\v abc` instead of `\v 1`):

- **Linting flags it as error** immediately
- Node remains in place as marker
- Text content shows red underline
- Tooltip explains the issue
- User can fix by retyping proper number
- Node does NOT automatically convert to text node (stays as verse marker)

### Chapter Number Validation

Similar validation applies to chapter numbers (`\c 1`, `\c 2`, etc.):

- Chapter numbers are editable in all modes (except chapters are scaffolded/fixed)
- Invalid chapter numbers are flagged by linter
- Sequential chapter numbering is validated when applicable

## Nested Content (Footnotes, Notes)

### Behavior

Footnotes (`\f ... \f*`) and other nested content markers are handled via `USFMNestedEditorNode` - each footnote has its own isolated editor state.

**Mode Inheritance**:
- Footnote markers (`\f`) follow the **same locking/hiding rules** as other markers in the parent editor
- The footnote editor **inherits** the parent editor's current mode settings
- Same mode rules apply inside the footnote editor (Regular = editable text, USFM = markers visible, Raw = plain text)

**Editing Footnotes**:
- In Regular mode: Footnote markers are hidden/locked, only footnote content is editable
- In USFM mode: Footnote markers are visible and fully editable
- In Raw mode: Footnotes are plain text with no structure enforcement
- Cursor correction logic applies within footnote editor just like main editor

**Creating Footnotes**:
- Footnotes can be inserted via context menu in all modes
- When inserted in Regular mode, the `\f` marker becomes locked/hidden immediately after insertion
- Footnote content is opened in an editor that inherits the parent's mode

## Performance Considerations

### Cursor Correction Listener

- Runs as `registerUpdateListener` (debounced, ~30-60fps)
- Only executes when selection changes or nodes are modified
- Minimal performance impact due to set-based lock checking (O(1) membership test)
- Early exit if not in Regular mode

### Mode Switching

- Settings change is instantaneous
- CSS visibility changes are browser-optimized (GPU-accelerated)
- Cursor correction runs in next frame, avoiding synchronous re-renders
- No expensive DOM traversals or full document scans

## Future Enhancements

Based on user testing and feedback, potential improvements:

1. **Verse Movement**: Allow cutting/moving entire verses via context menu action (not via keyboard)
2. **Smart Merge**: Provide explicit "Merge with previous verse" action in Regular mode
3. **Marker Templates**: Pre-defined marker patterns for common formatting tasks
4. **Mode-Specific Toolbars**: Different toolbar actions available based on current mode
5. **Footnote Behavior**: Clearer specification for nested content editing
6. **Undo/Redo Mode Awareness**: Preserve mode state across undo operations if needed

## Testing Considerations

### Regular Mode Tests

- [ ] Cursor cannot enter locked marker nodes
- [ ] Typing while cursor on locked marker redirects to editable text
- [ ] Backspace at verse start deletes linebreak, not `\v` marker
- [ ] Inserting marker via context menu creates locked/hidden node
- [ ] Undo works after marker insertion in Regular mode
- [ ] Copying preserves USFM structure
- [ ] Cut across locked nodes is blocked
- [ ] Mode switch preserves cursor position
- [ ] Verse numbers remain editable
- [ ] Character markers are hidden, content visible (italics styling)
- [ ] Empty character marker pairs are auto-deleted
- [ ] Poetry markers are hidden, content indented appropriately
- [ ] Line breaks do NOT create `\q` markers
- [ ] Context menu shows structural actions (merge, convert, etc.)
- [ ] Context menu actions work across all modes
- [ ] Chapter boundaries are respected (no chapter deletion)
- [ ] Verse insertion works at chapter start, middle, end

### USFM Mode Tests

- [ ] All markers are visible
- [ ] Typing `\v ` creates verse marker and number
- [ ] Cursor can navigate into and edit markers
- [ ] Deleting characters from marker converts to text node (invalid marker)
- [ ] Linting flags malformed markers
- [ ] Character marker pairs are visible and editable
- [ ] Poetry markers are visible, can be edited directly
- [ ] Context menu shows all structural editing actions
- [ ] Merge with previous/next verse works correctly
- [ ] Convert to poetry/paragraph works correctly
- [ ] Poetry level changes update all lines appropriately

### Raw Mode Tests

- [ ] All content is visible as plain text
- [ ] No auto-insertion of markers
- [ ] No structure maintenance
- [ ] CSS indicates raw mode styling

## Glossary

- **USFM**: Unified Standard Format Markers - the markup language used for scripture encoding
- **Token**: A parsed unit of USFM content (marker, text, verse number, etc.)
- **Node**: Lexical editor representation of a USFM token or element
- **Locked Node**: A node where `isMutable: false`, preventing direct editing
- **Hidden Node**: A node where `show: false`, rendering it invisible in Regular mode
- **Cursor Correction**: Automatic adjustment of cursor position when it enters a locked node
- **WYSIWYG**: What You See Is What You Get - visual editing mode
- **Linting**: Automated validation that identifies malformed or incomplete USFM structure
- **SidContentMap**: A rich, contextual map mapping Scripture IDs to their content, structure, and position within document
- **Character Marker**: A USFM marker that wraps around text (e.g., `\wj` for words of Jesus)
- **Poetry Marker**: A paragraph-level marker (`\q1`, `\q2`, `\q3`) that controls indentation levels
- **inPara Property**: A flag on text nodes indicating what type of container/paragraph they belong to
- **Structural Editing**: Operations that change document structure (merge verses, convert prose to poetry, etc.)
