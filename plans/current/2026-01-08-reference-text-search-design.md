# Reference Text Search Feature Design

## Overview

This design extends the existing find and replace functionality to support searching in a loaded reference text for quality control purposes. Users can search for terms in a source/reference text (e.g., "Noah") and then navigate to the corresponding verses in their target translation to ensure completeness. Replace functionality is hidden when searching reference text, as the search term may not exist in the translation (different orthography, translation choices, etc.).

## Architecture Overview

The core change involves modifying `useProjectSearch` to support dual search modes:

- **Target Mode (default)**: Searches through the user's translation files, with full replace functionality
- **Reference Mode**: Searches through the loaded reference text, with replace controls hidden

The hook will receive access to reference text data through a new prop. Reference texts are already loaded in the workspace context for display, so we simply need to pass that data to the search hook.

The search results structure remains unchanged - each result still contains a `sid`, `text`, `bibleIdentifier`, etc. The key difference is:

- In Target Mode: The `text` field contains the translation text
- In Reference Mode: The `text` field contains the reference text, but clicking the result navigates to that SID in the target editor

This keeps the results list UI simple and consistent - it's just the source of the text and the visibility of replace controls that changes.

## Component and State Changes

### New State in `useProjectSearch`

We'll add a `searchMode` state to track which text is being searched:

```typescript
type SearchMode = "target" | "reference";

// Inside useProjectSearch:
const [searchMode, setSearchMode] = useState<SearchMode>("target");
```

### Updated Hook Props

A new prop will be passed to the hook:

```typescript
type Props = {
    workingFiles: ParsedFile[];
    referenceFiles?: ParsedFile[]; // NEW: Optional reference text
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
    switchBookOrChapter: (file: string, chapter: number) => ParsedChapter | undefined;
    editorRef: React.RefObject<LexicalEditor | null>;
    pickedFile: ParsedFile;
    pickedChapter: ParsedChapter;
};
```

### Search Panel UI Updates

The `SearchPanel` component will add a dropdown selector in the controls section:

```tsx
<Select
    value={searchMode}
    onChange={setSearchMode}
    data={[
        { value: "target", label: "Current Translation" },
        { value: "reference", label: "Reference Text" },
    ]}
    disabled={!referenceFiles || referenceFiles.length === 0}
/>
```

The dropdown will be disabled when no reference text is loaded.

### Replace Controls Conditional Rendering

The replace controls (input field and buttons) will be wrapped in a conditional:

```tsx
{searchMode === "target" && (
    <ReplaceControls ... />
)}
```

This hides the entire replace section when in Reference Mode.

## Search Logic and Data Flow

### Search Execution Changes

The `runSearchLogic` function will be modified to switch between file sources based on `searchMode`:

```typescript
const filesToSearch = searchMode === "reference"
    ? referenceFiles || []
    : saveCurrentDirtyLexical() || workingFiles;
```

When in Reference Mode and no reference files are loaded, the search returns no results (graceful fallback).

### Result Text Handling

The `SearchResult` type remains the same, but the `text` field has different semantics:
- **Target Mode**: Contains the matched translation text for preview
- **Reference Mode**: Contains the matched reference text for preview

When displaying results in the `SearchPanel`, the text preview will always show what was actually searched (translation or reference), making it clear to users what they found.

### Navigation Behavior

The `pick()` function behavior remains unchanged - it always navigates to the target text editor at the selected SID:

```typescript
function pick(result: SearchResult, activeSearchTerm = searchTerm) {
    // Switch to the book/chapter in the TARGET editor
    const newChapterState = switchBookOrChapter(
        result.bibleIdentifier,
        result.chapNum,
    );
    // ... then highlight and scroll
}
```

This is intentional: regardless of whether we found "Noah" in the reference or "Noé" in the target, we navigate to `GEN 6:9` in the target text so the user can verify their translation covers that verse.

### Search Source Indicator

Results should indicate which text was searched. We'll add a field:

```typescript
type SearchResult = {
    sid: string;
    text: string;
    bibleIdentifier: string;
    chapNum: number;
    parsedSid: ParsedReference | null;
    isCaseMismatch: boolean;
    naturalIndex: number;
    searchedIn: "target" | "reference"; // NEW
};
```

This could be used to show a subtle label in the results list (e.g., "Found in reference").

## Error Handling and Edge Cases

### No Reference Text Loaded

When the workspace doesn't have a reference text loaded:
- The dropdown selector is disabled (visual indicator: grayed out)
- If user somehow selects Reference Mode, search returns empty results with no error
- Clear messaging could be added: "No reference text loaded" in the results area

### Missing Books/Chapters in Reference

Reference texts might not have all the books that the target translation does:
- The search naturally handles this by only searching through the reference files that exist
- If a user searches for a term that appears in target-only books, Reference Mode simply won't find those results
- No special handling needed - this is expected behavior

### Mode Switching During Active Search

When a user switches from Target to Reference mode while a search is active:
- `searchTerm` remains unchanged (they want to find the same term in the reference)
- The existing `useEffect` that runs `runSearchLogic` when dependencies change will trigger automatically
- Results update to show matches in the new scope
- `CSS.highlights.clear()` clears old highlights before new ones are applied

### Case Mismatch in Reference Results

The `isCaseMismatch` field in `SearchResult` compares the `searchTerm` input against the matched text. This works the same way in Reference Mode:
- If searching for "noah" (lowercase) and reference has "Noah", `isCaseMismatch = true`
- This flag is used for sorting (mismatches to top) and potentially for UI indicators
- The behavior remains consistent across both modes

### Performance Considerations

Reference texts are typically the full Bible or substantial portions:
- Same debouncing (500ms) applies to Reference Mode
- Same abort controller logic cancels pending searches when mode switches
- Same virtualization in results list handles large result sets
- No additional performance concerns beyond current implementation

### Replace Guardrails

Even though replace controls are hidden in Reference Mode, we ensure safety:
- The `replaceCurrentMatch()` and `replaceAllInChapter()` functions check `searchMode === "target"` before executing
- This prevents any accidental calls to replace from other code paths

## Reference-Only Book Handling

### Filtering Non-Target Books

When searching in Reference Mode, the search should only return results for books that exist in the target project. During `runSearchLogic`:

```typescript
// Get target book codes for filtering
const targetBookCodes = new Set(workingFiles.map(f => f.bookCode));

// When building results in Reference Mode
if (searchMode === "reference") {
    const matchResult = findMatch({...});
    if (matchResult.isMatch && targetBookCodes.has(file.bookCode)) {
        allResults.push({
            sid,
            text,
            bibleIdentifier: file.bookCode,
            chapNum: chapter.chapNumber,
            parsedSid: parseSid(sid),
            isCaseMismatch: query !== matchResult.matchedTerm,
            naturalIndex: naturalIndex,
        });
    }
}
```

### Counting and Displaying Excluded Results

We need to track matches found in books not in the target project:

```typescript
let resultsOutsideProject = 0;

if (searchMode === "reference") {
    const matchResult = findMatch({...});
    if (matchResult.isMatch) {
        if (targetBookCodes.has(file.bookCode)) {
            allResults.push({...});
        } else {
            resultsOutsideProject++;
        }
    }
}

// After search completes, expose this count
setResultsOutsideProject(resultsOutsideProject);
```

### UI Message

In the `SearchPanel`, when `searchMode === "reference"` and `resultsOutsideProject > 0`:

```tsx
{searchMode === "reference" && resultsOutsideProject > 0 && (
    <Alert variant="subtle" color="blue">
        {resultsOutsideProject} results found in books not in your project
    </Alert>
)}
```

This appears near the results count, clearly indicating why some matches aren't shown.

## Context Menu Integration (Future Scope)

The current context menu has a "Find 'term'" action that searches the selected text in the target translation. A future enhancement could add a second action like "Find 'term' in reference" when reference text is loaded. This is not included in the initial implementation.

## Integration Points

### Workspace Context

The `WorkspaceContext` already manages reference text data. We'll need to:
- Pass `referenceFiles` from context to the `useProjectSearch` hook
- Ensure the search hook is updated when reference files are loaded/unloaded

### Editor State Management

The existing `switchBookOrChapter` and `editorRef` handling remains unchanged. Navigation always targets the target editor regardless of search mode.

### Search Panel Component

The `SearchPanel` component will need to:
- Accept the new `searchMode` prop from `useProjectSearch`
- Render the dropdown selector
- Conditionally hide replace controls
- Display the "results outside project" alert when applicable

## Files to Modify

- `src/app/ui/hooks/useSearch.tsx` - Add search mode state, reference files prop, modify search logic
- `src/app/ui/contexts/WorkspaceContext.tsx` - Pass reference files to search hook
- `src/app/ui/components/search/SearchPanel.tsx` - Add dropdown, conditional rendering, alert message

## Testing Considerations

### Unit Tests

- Test search mode state transitions
- Test filtering results to target project books
- Test replace functions guardrails (no-op in reference mode)
- Test resultsOutsideProject counting logic

### Integration Tests

- Test dropdown switching between modes
- Test replace controls visibility
- Test search with and without reference text loaded
- Test alert display for reference-only results

### E2E Tests

- Full workflow: load reference, switch to reference mode, search "Noah", verify results navigate to target
- Verify replace controls hidden in reference mode
- Verify alert appears when reference has matches in non-target books
