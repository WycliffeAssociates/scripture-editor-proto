# Save, Diff, and Revert Functionality Specification

## Overview

The Dovetail Scripture Editor provides a comprehensive save, diff, and revert system that tracks changes made to scripture content at a granular level. This system enables users to review changes across their entire project before persisting to disk, revert individual changes with precision, and understand what has been modified through semantic diffing. The system operates at the Scripture ID (SID) level, treating each verse or verse fragment as an independently reversible unit. This granularity allows users to make confident changes with the safety net of a built-in review mechanism.

The system is designed to handle large USFM (Unified Standard Format Markers) projects efficiently. Instead of saving entire books on every change operation, it tracks modifications and only persists the books that contain changes. The diffing algorithm uses semantic understanding of scripture structure—recognizing verses, footnotes, and other USFM blocks—to provide meaningful comparisons rather than raw text diffs. This makes it easier for translators and editors to understand their changes in context.

## Core Architecture

The save and diff system is built around the `useProjectDiffs` hook, which serves as the single source of truth for tracking changes. This hook maintains two critical data structures: a map of the original loaded state (the "baseline") and a map of the current working state. These maps are indexed by Scripture IDs (SIDs) and organized hierarchically by book and chapter.

The architecture uses a "dirty state" approach where changes are tracked in memory until explicitly saved. When users open the Review & Save modal, the system calculates diffs by comparing the current working state against the original baseline using a Longest Common Subsequence (LCS) algorithm. This provides positionally aware diffing that understands when blocks have been added, removed, or modified, rather than simply comparing text strings.

**Key Components:**
- **useProjectDiffs Hook**: Central logic for tracking changes, computing diffs, handling reverts, and persisting saves
- **DiffModal Component**: UI for displaying changes, with responsive layouts for desktop and mobile
- **SID Content Map**: A hierarchical structure mapping books → chapters → SIDs → content blocks
- **DiffMap**: A flat map of change objects keyed by unique identifiers

The hook maintains references to the working files array (the source of truth for current content) and builds in-memory maps that enable efficient diff calculations without cloning large data structures. This approach allows the system to perform surgical updates when reverting changes—directly mutating the working files through the references held in the diff objects.

## Diff Calculation and Detection

The system calculates diffs through a multi-phase process that ensures accuracy and performance. When a chapter is opened or the modal is triggered, the system builds SID content maps for both the original loaded state and the current working state. These maps capture every verse, footnote, and other content block with rich metadata including positional information, USFM structure, and plain text.

The diffing algorithm operates at the chapter level, treating each block as an atomic unit. It uses a Longest Common Subsequence (LCS) algorithm via `diffArrays` to determine positional changes—identifying which blocks have been added, removed, or remained in place. For blocks that exist in both states, the system performs word-level diffing using `diffWordsWithSpace` to highlight specific text modifications.

Each diff object contains comprehensive information about the change:
- **Unique Key**: An identifier that handles duplicate SIDs (e.g., "GEN 1:1_dup_1")
- **Semantic SID**: The human-readable scripture reference
- **Status**: "added", "deleted", or "modified"
- **Original and Current Content**: Complete SidContent objects for both states
- **Word Diff**: Granular text changes shown with highlighting
- **Positional Data**: Book code, chapter number, and order within the document

The system detects out-of-order verses and flags them with detail messages (e.g., "Out of order (expected v. 5)"). This helps users identify structural problems that might affect scripture integrity. The positional awareness ensures that reordering verses is detected as additions and deletions, not just text modifications, preserving the semantic meaning of changes.

Diff calculation is optimized to update incrementally. When a user makes changes in a chapter, only that chapter's diff is recalculated. The modal can be opened and closed without triggering full project-wide recalculations—only the currently viewed chapter's state is refreshed when the modal is triggered.

## Revert Functionality

The revert system allows users to undo individual changes at a granular level. Each diff item includes a revert button that restores that specific change to its original state. The system handles three types of reverts based on the diff status:

**Added content**: When a diff has `original: null`, the revert operation removes the newly added block. The system locates the block's position in the chapter node list and splices out all nodes belonging to that block.

**Deleted content**: When a diff has `current: null`, the revert operation restores the deleted block. The system determines the correct insertion point by walking backward through the chain of previous SIDs until it finds a block that still exists in the current state. This ensures restored content appears in the correct position even when intervening blocks have been added or removed.

**Modified content**: When both original and current states exist, the revert operation replaces the current nodes with the original nodes while preserving the block's position in the document.

The revert process operates through direct mutation of the working files array. Each diff object holds references to its parent arrays and starting indices, enabling surgical updates without expensive cloning operations. After reverting, the system:

1. Updates the affected chapter in the current SID content map
2. Recalculates diffs for that chapter only
3. Updates the UI to reflect the removed diff
4. If the reverted change is currently visible in the editor, updates the editor state programmatically using `setEditorState` with a special tag that bypasses change tracking

This programmatic editor update ensures the user sees the reverted content immediately without requiring manual navigation or refresh. The tag mechanism (`EDITOR_TAGS_USED.programmaticDoRunChanges`) prevents the revert operation from being recorded in Lexical's undo history, avoiding confusing undo states.

Reverts are independent operations—users can revert changes in any order without dependencies. If a user reverts a change that was previously reverted, the system correctly identifies it as a modification (the "current" state becomes the previously restored content).

## Save and Persistence

When users click "Save all changes" in the Review & Save modal, the system persists only the books that contain modifications. This selective approach minimizes write operations and improves performance for large projects.

The save process follows these steps:

1. **Identify changed books**: The system examines all diffs to collect unique book codes that contain changes.

2. **Serialize to USFM**: For each changed book, the system iterates through all chapters (not just modified ones) and serializes their current lexical state to USFM strings using `serializeToUsfmString`. This ensures complete book integrity is maintained, as USFM files represent whole books rather than chapter fragments.

3. **Persist to storage**: The system calls `loadedProject.addBook()` for each book, writing the USFM content to the appropriate storage backend (OPFS for web, file system for desktop). Uses `Promise.allSettled` to handle failures gracefully—partial saves are possible if some books fail while others succeed.

4. **Handle errors**: If any save operations fail, errors are logged to the console. If all saves succeed, a success notification displays: "Saved X book(s) successfully."

5. **Update baselines**: After successful persistence, the system updates both baseline structures:
   - Sets `originalSidMapRef.current` to a clone of `currentSidMap.current`
   - Updates each chapter's `loadedLexicalState` to match its current `lexicalState`

6. **Clear diffs**: The system recalculates the diff map between the now-identical original and current states, resulting in an empty diff list. The modal automatically displays "No changes detected."

This baseline update approach means subsequent diffs compare against the newly saved state, not the initial loaded state. Users can make additional changes and save again, with each save operation establishing a new checkpoint.

The system does not provide automatic saving—changes persist only when the user explicitly triggers a save operation through the Review & Save modal. This design gives users control over when their work is committed to permanent storage and allows them to review changes before finalizing.

## User Interface

**Access:** Users access the save and diff functionality through a "Review & Save" trigger button. This opens a modal displaying all unsaved changes across the project.

**Displayed Information:**
- Each change shows the scripture reference (SID) with book titles localized to the project language
- Warnings display for out-of-order verses (e.g., "Out of order (expected v. 5)")
- For each change, both the original and current content are displayed
- Text additions and deletions are highlighted within modified content
- Special indicators show when content was added ("New verse") or deleted ("Verse deleted")

**Available Actions:**
- **Navigate to chapter**: Opens the editor to the chapter containing a specific change and temporarily highlights the affected verse
- **Revert individual change**: Restores a single change to its original state; the diff list updates immediately
- **Save all changes**: Persists all displayed changes to disk

**Feedback:**
- Successful saves display a notification with the count of books saved
- If no changes exist, the modal displays "No changes detected"
- After saving, the diff list becomes empty since all changes have been committed

**State Management:**
- The modal can be opened and closed without losing unsaved changes
- When opened, the modal immediately displays the current diff state (no caching or snapshots)

## Footnotes and Nested Content

The system treats footnotes and other nested USFM content as independently reversible blocks, separate from their parent verses. Each footnote is assigned a unique key that references its parent SID (e.g., "GEN 1:1_f_1" for the first footnote on Genesis 1:1). This design allows users to revert, review, and save footnote changes independently of the verse they annotate.

The diffing process handles nested content by creating distinct entries in the SID content map. Footnote blocks include their own content nodes, positional data, and display identifiers (e.g., "GEN 1:1 (f note)"). The system maintains parent-child relationships through the `semanticSid` field, ensuring the hierarchical structure is preserved during revert and save operations.

When calculating diffs, nested content is treated as a separate block in the positional sequence. This means a footnote between verses appears as a distinct item in the diff list, allowing granular control over footnote modifications without affecting verse diffs.

The unique key approach prevents collisions when multiple footnotes or other nested elements exist within the same parent verse. Each nested element receives an incrementing counter appended to its key (e.g., "GEN 1:1_f_1", "GEN 1:1_f_2").

## Performance Considerations

The system optimizes performance through several key strategies:

**Incremental Diff Updates:** Only the currently viewed chapter's diff is recalculated when changes occur or when the modal is opened. Full project-wide diff calculation happens only once on initial load.

**Direct Reference Mutation:** Revert operations mutate the working files array directly through references held in diff objects, avoiding expensive cloning of large data structures.

**Selective Persistence:** Save operations only write books that contain changes. Unchanged books are not touched during save operations.

**Efficient Data Structures:** The hierarchical SID content map structure enables O(1) lookups for any content block by its unique key. Positional information is pre-calculated and stored, eliminating repeated traversal operations.

**State Reuse:** In-memory maps are reused rather than recreated. After a successful save, the original baseline is updated by cloning the current map, not by rebuilding from files.

The system is designed to handle large USFM projects with many chapters and verses without performance degradation, as diff calculation and display scale with the number of actual changes rather than the total project size.

## Error Handling

The system handles various error scenarios gracefully:

**Save Operation Failures:**
- Uses `Promise.allSettled` when persisting books, allowing partial saves if some books fail
- Logs errors to the console when save operations reject
- Displays success notification only when all saves complete successfully
- Failed saves do not update baselines, allowing users to retry

**Diff Calculation Failures:**
- Invalid SID references are caught and logged during diff building
- Missing content for expected keys throws descriptive errors indicating the missing key
- The system continues processing other chapters if one chapter's diff calculation fails

**Revert Operation Failures:**
- Invalid SIDs in diff objects are caught and logged without executing the revert
- Missing chapter references during revert operations are logged and skipped
- Invalid anchor SIDs during deletion reverts fall back to earlier SIDs in the chain, eventually placing content at the beginning of the chapter if no valid anchor is found

**Data Integrity:**
- The system validates that required fields (semanticSid, bookCode, chapterNum) are present before building diffs
- Empty or null content is handled appropriately based on context (additions, deletions, or modifications)

## Edge Cases and Special Behaviors

**Duplicate SIDs:**
The system handles duplicate verse references by appending a counter to create unique keys (e.g., "GEN 1:1_dup_1", "GEN 1:1_dup_2"). This preserves the independence of each duplicate block while allowing individual reverts.

**Out-of-Order Verses:**
When verses appear in non-sequential order, the system detects this and displays a warning message (e.g., "Out of order (expected v. 5)"). This detection only applies to verse-level SIDs within the same chapter and does not flag chapter-level markers or book headers.

**Large Structural Changes:**
When users change entire blocks of USFM content (e.g., replacing a paragraph with a different structure), the system treats this as a modification with structural differences. The diff displays the full USFM text rather than trying to extract plain text, ensuring all marker changes are visible.

**Cross-Chapter Changes:**
The system tracks changes across chapter boundaries by maintaining separate maps for each chapter. Users can navigate between chapters while the modal is open, and diffs from all chapters remain visible in a single list.

**Empty States:**
- Opening the modal with no unsaved changes displays "No changes detected"
- Reverting all changes from a chapter removes that chapter's diffs from the list
- Saving successfully clears all diffs as baselines are synchronized

## Future Enhancements

**Async Collaboration:**
The current diff and revert mechanism could serve as the foundation for async collaboration features. By computing diffs at the semantic SID level, the system can merge changes from multiple users who have edited the same scripture project independently. This approach provides a more user-friendly alternative to traditional git diffs for USFM files, showing changes at the verse level rather than as line-by-line text modifications.

**Granular Merge Resolution:**
In a collaborative environment, conflicts could be resolved at the verse level rather than the file level. When two users modify different verses within the same book, the system could automatically merge their changes. When the same verse is modified by multiple users, the diff display could present both versions for side-by-side comparison and manual resolution.

**Change History and Annotated Reverts:**
Future iterations could maintain a history of saved states, allowing users to revert to previous checkpoints rather than just the immediate baseline. Each save operation could optionally capture annotations or commit messages, providing context for future review of project evolution.

## Glossary

- **SID**: Scripture ID - A unique identifier for a scripture reference (e.g., "GEN 1:1"). Can include book, chapter, verse, and optional verse ranges.
- **USFM**: Unified Standard Format Markers - The markup format used for scripture documents, including markers for verses, chapters, paragraphs, and footnotes.
- **Lexical**: The rich text editor framework used in the application for editing scripture content.
- **Lexical Editor State**: The serialized representation of editor content, containing a tree of nodes representing USFM structure and text.
- **LCS**: Longest Common Subsequence - An algorithm used to compare sequences and identify additions, deletions, and unchanged elements.
- **DiffMap**: A flat record structure mapping unique keys to ProjectDiff objects, representing all changes across a project.
- **SidContent**: A rich object containing all metadata about a specific content block, including its nodes, position, text components, and structural information.
- **SidContentMap**: A hierarchical structure mapping books → chapters → unique keys → SidContent objects.
- **Baseline**: The originally loaded state of the project against which all current changes are compared.
- **Semantic SID**: The human-readable scripture reference without duplicate disambiguators (e.g., "GEN 1:1").
- **Unique Key**: The identifier used in the SidContentMap that may include disambiguators for duplicates (e.g., "GEN 1:1_dup_1").
- **Nested Content**: USFM elements that exist within another element's scope, such as footnotes, cross-references, or study notes.

## Testing Considerations

**Unit Tests:**
- Sid content map building with duplicate SIDs, out-of-order verses, and nested content
- Diff calculation algorithms for additions, deletions, and modifications
- Word-level diff generation with various text patterns
- Revert operations for all three change types
- Baseline update and synchronization

**Integration Tests:**
- Modal opening and closing with unsaved changes
- Diff list updates when chapters are modified
- Revert operations with active editor state
- Save operations with partial failures
- Navigation to chapters from diff items

**E2E Tests:**
- Complete workflow: modify text, open modal, review changes, revert, save, verify persistence
- Multiple changes across different books and chapters
- Footnote modification and revert
- Large structural changes (paragraph reformatting, marker changes)
- Error recovery from failed save operations

**Performance Tests:**
- Diff calculation on large projects (50+ chapters)
- Modal rendering with hundreds of diff items
- Revert operations on heavily modified chapters
- Save operations with multiple changed books
