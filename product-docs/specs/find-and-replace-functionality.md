# Find and Replace Functionality Specification

## Overview

The Dovetail Scripture Editor provides comprehensive find and replace functionality that allows users to search for text across an entire scripture project and replace occurrences within individual chapters. This feature is designed to help translators and editors efficiently locate and modify text throughout their scripture documents.

## Core Architecture

The find and replace system is built around the `useProjectSearch` hook, which integrates with the Lexical editor and provides a unified search experience across all chapters and books in a project.

### Key Components

1. **SearchPanel**: The main UI component that displays search controls and results
2. **useProjectSearch Hook**: Core logic for searching, highlighting, and replacing text
3. **SearchTrigger**: Toolbar button that toggles the search panel
4. **CSS Highlights API**: Browser-native highlighting for search matches

## Search Behavior

### Search Scope

- **Project-wide search**: Searches across all files and chapters in the current project
- **Text extraction**: Searches through serialized USFM content, extracting text by Scripture ID (SID)
- **Real-time results**: Updates search results as the user types (debounced at 500ms)

### Search Options

#### Case Sensitivity
- **Match Case**: When enabled, search respects letter case (A ≠ a)
- **Default**: Case-insensitive search
- **Behavior**: Uses JavaScript regex flags (`g` for global, `i` for case-insensitive)

#### Whole Word Matching
- **Whole Word**: When enabled, only matches complete words bounded by word boundaries
- **Implementation**: Uses regex word boundaries (`\b`) around the search term
- **Default**: Substring matching (partial word matches allowed)

### Search Results

#### Result Structure
Each search result contains:
- `sid`: Scripture ID (e.g., "GEN 1:1")
- `text`: The full text content of the verse/chapter section
- `bibleIdentifier`: Book code (e.g., "GEN")
- `chapNum`: Chapter number
- `parsedSid`: Parsed reference object
- `isCaseMismatch`: Boolean indicating if the match differs in case from search term
- `naturalIndex`: Sequential index for sorting

#### Result Display
- **Virtualized list**: Uses TanStack Virtual for performance with large result sets
- **Highlighting**: Uses `react-highlight-words` to highlight matches in result previews
- **Navigation**: Shows current position (e.g., "3 of 15 results")
- **Sorting**: Can sort by canonical order or group case mismatches first

## Replace Functionality

### Replace Scope

- **Chapter-limited**: Replace operations are restricted to the current chapter
- **Single replacement**: "Replace" button replaces the currently selected match
- **Bulk replacement**: "Replace all in this chapter" replaces all matches in the current chapter

### Replace Process

#### Single Match Replacement
1. Identifies the current match using `currentMatches` array
2. Updates the Lexical editor to replace text in the specific node
3. Removes the replaced result from the results list
4. Moves to the next match in the same chapter (if available)

#### Bulk Replacement
1. Iterates through all matches in the current chapter
2. Replaces each occurrence using `text.replaceAll(searchTerm, replaceTerm)`
3. Clears all results for the current chapter
4. Resets selection state

### Replace Limitations

- **No undo integration**: Replace operations are not integrated with Lexical's undo system
- **Chapter boundary**: Cannot replace across chapter boundaries
- **Live updates**: Search results update immediately after replacement

## User Interface

### Search Panel

#### Desktop Layout
- **Persistent sidebar**: Appears as a fixed panel on the left side of the editor
- **Header**: Contains title and close button
- **Controls section**: Search input, options, and replace controls
- **Results section**: Virtualized list of search results

#### Mobile Layout
- **Drawer**: Slides up from the bottom on mobile devices
- **Full-screen**: Takes up the entire screen height
- **Touch-friendly**: Larger buttons and spacing for mobile interaction

### Search Controls

#### Search Input
- **Debounced input**: 500ms delay before triggering search
- **Navigation buttons**: Previous/Next buttons to cycle through matches
- **Loading indicator**: Shows spinner during search operations
- **Auto-focus**: Automatically focuses input when panel opens

#### Options
- **Match Case checkbox**: Toggles case-sensitive searching
- **Whole Word checkbox**: Toggles whole word matching

#### Replace Controls
- **Replace input**: Text field for replacement text
- **Replace button**: Replaces current match
- **Replace All button**: Replaces all matches in current chapter

### Results Display

#### Result Items
- **SID display**: Shows scripture reference (e.g., "GEN 1:1")
- **Text preview**: Shows verse text with highlighted matches
- **Click navigation**: Clicking a result navigates to that location in the editor

#### Statistics
- **Match count**: Shows current position and total results
- **Case mismatch indicator**: Shows count of case mismatches when sorted

## Editor Integration

### Highlighting

#### CSS Highlights API
- **Native browser highlighting**: Uses `CSS.highlights.set()` for performance
- **Match highlighting**: Highlights all occurrences of the search term in the current chapter
- **Range-based**: Creates DOM ranges for precise highlighting

#### Highlight Management
- **Automatic clearing**: Clears highlights when search term is cleared
- **Single highlight set**: Uses "matched-search" as the highlight name
- **Whole word support**: Handles both substring and whole word highlighting

### Navigation

#### Match Selection
- **Auto-selection**: Automatically selects the first match in the current chapter
- **Manual selection**: Users can click results to navigate
- **Scroll behavior**: Smooth scrolls to match location with "center" block alignment

#### Match Cycling
- **Previous/Next**: Buttons to cycle through matches in the current chapter
- **Boundary handling**: Wraps around when reaching first/last match
- **Highlight updates**: Updates highlighting as user navigates

## Performance Considerations

### Search Optimization

#### Debouncing
- **500ms delay**: Prevents excessive searches while typing
- **Abort controller**: Cancels previous searches when new ones start

#### Asynchronous Processing
- **Non-blocking**: Search runs in background without freezing UI
- **Chunked processing**: Processes files sequentially to avoid long blocking operations

#### Memory Management
- **Virtualization**: Only renders visible results for large result sets
- **Cleanup**: Properly aborts searches and clears highlights on unmount

## Error Handling

### Search Failures
- **Empty search**: Gracefully handles empty or whitespace-only search terms
- **No results**: Shows appropriate "no results found" message
- **Abort handling**: Properly handles cancelled searches

### Replace Errors
- **Editor access**: Checks for valid editor reference before operations
- **Node validation**: Ensures target nodes are valid USFM text nodes


## Integration Points

### Workspace Context
- **Global state**: Search state is managed at the workspace level
- **Cross-component**: Search panel and trigger communicate through context

### Editor Synchronization
- **File switching**: Updates search when user navigates between books/chapters
- **Dirty state**: Handles unsaved changes during search operations

### Persistence
- **No persistence**: Search state is not saved between sessions
- **Reset on navigation**: Clears search when switching projects

## Future Enhancements

### Planned Features
None atm. 

## Testing Considerations

### Unit Tests
- **Hook testing**: Test search logic and state management
- **Regex testing**: Validate search pattern generation
- **Replace testing**: Test text replacement operations

### Integration Tests
- **UI interaction**: Test search panel opening/closing
- **Editor integration**: Test highlighting and navigation
- **Mobile responsiveness**: Test drawer behavior on small screens

### E2E Tests
- **Full workflows**: Test complete search and replace scenarios
- **Performance testing**: Validate search speed with large projects
- **Accessibility testing**: Ensure screen reader compatibility

## Glossary

- **SID**: Scripture ID - a unique identifier for a scripture reference (e.g., "GEN 1:1")
- **USFM**: Unified Standard Format Markers - the markup format used for scripture
- **Lexical**: The rich text editor framework used in the application
- **Virtualization**: Rendering only visible items in large lists for performance
- **Debouncing**: Delaying function execution until after user stops typing
- **CSS Highlights API**: Browser API for programmatically highlighting DOM ranges