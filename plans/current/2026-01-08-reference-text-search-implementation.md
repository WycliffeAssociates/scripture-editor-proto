# Reference Text Search - Implementation Plan

## Overview

This document provides the technical implementation details for adding reference text search functionality. It builds upon the design doc and provides specific code changes, file modifications, and testing guidance for engineers to implement the feature.

## Phase 1: Hook Modifications

### File: `src/app/ui/hooks/useSearch.tsx`

#### Step 1: Add Search Mode Type

Add new type export at the top of the file (after imports, around line 6):

```typescript
export type SearchMode = "target" | "reference";
```

#### Step 2: Update Props Type

Add `referenceFiles` to the `Props` interface (around line 23):

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

#### Step 3: Add New State Variables

Inside `useProjectSearch` function, add new state (around line 63, after existing state declarations):

```typescript
const [searchMode, setSearchMode] = useState<SearchMode>("target");
const [resultsOutsideProject, setResultsOutsideProject] = useState(0);
```

#### Step 4: Update SearchResult Type

Modify the `SearchResult` type to include search source (around line 35):

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

#### Step 5: Modify runSearchLogic Function

Update the files selection logic in `runSearchLogic` (around line 196):

```typescript
// After CSS.highlights.clear();

// Prepare target book codes for filtering (only in reference mode)
const targetBookCodes = new Set(workingFiles.map(f => f.bookCode));

const filesToSearch = searchMode === "reference"
    ? referenceFiles || []
    : saveCurrentDirtyLexical() || workingFiles;

const allResults: SearchResult[] = [];
let resultsOutsideProject = 0; // NEW counter
```

Modify the result building loop (around line 208) to include filtering:

```typescript
// Inside the chapter loop:
for (const file of filesToSearch) {
    if (signal.aborted) return;

    for (const chapter of file.chapters) {
        if (signal.aborted) return;

        const serializedNodes = chapter.lexicalState.root.children;
        const sidRecord = reduceSerializedNodesToText(serializedNodes);

        let naturalIndex = 0;
        for (const [sid, text] of Object.entries(sidRecord)) {
            const matchResult = findMatch({
                matchCase,
                searchTerm: query,
                matchWholeWord,
                textToSearch: text,
            });
            
            if (matchResult.isMatch) {
                // NEW: Filter out results for books not in target project when searching reference
                if (searchMode === "reference" && !targetBookCodes.has(file.bookCode)) {
                    resultsOutsideProject++;
                } else {
                    allResults.push({
                        sid,
                        text,
                        bibleIdentifier: file.bookCode,
                        chapNum: chapter.chapNumber,
                        parsedSid: parseSid(sid),
                        isCaseMismatch: query !== matchResult.matchedTerm,
                        naturalIndex: naturalIndex,
                        searchedIn: searchMode, // NEW
                    });
                    naturalIndex++;
                }
            }
        }
    }
}
```

After the search completes, expose the outside project count (around line 239):

```typescript
// After const sortedResults = applySort(allResults, currentSort);
setResults(sortedResults);
setResultsOutsideProject(resultsOutsideProject); // NEW
```

#### Step 6: Guard Replace Functions

Update `replaceCurrentMatch` function (around line 474):

```typescript
function replaceCurrentMatch() {
    if (currentMatches.length === 0 || !pickedResult) return;
    if (searchMode !== "target") return; // NEW: Guard clause
    
    // ... rest of function unchanged
}
```

Update `replaceAllInChapter` function (around line 515):

```typescript
function replaceAllInChapter() {
    if (!pickedResult || !replaceTerm) return;
    if (searchMode !== "target") return; // NEW: Guard clause
    
    // ... rest of function unchanged
}
```

#### Step 7: Update Return Type

Add new return values to the return object (around line 546):

```typescript
return {
    searchTerm,
    onSearchChange,
    isSearching,
    replaceTerm,
    setReplaceTerm,
    results,
    pickedResult,
    pickedResultIdx,
    pickSearchResult: (r: SearchResult) => pick(r, searchTerm),
    nextMatch,
    prevMatch,
    replaceCurrentMatch,
    replaceAllInChapter,
    currentMatchIndex,
    totalMatches: currentMatches.length,
    numCaseMismatches: results.filter((r) => r.isCaseMismatch).length,
    hasNext,
    hasPrev,
    isSearchPaneOpen,
    setIsSearchPaneOpen,
    matchWholeWord,
    setMatchWholeWord,
    matchCase,
    setMatchCase,
    escapeRegex,
    sortBy,
    currentSort,
    searchMode,  // NEW
    setSearchMode,  // NEW
    resultsOutsideProject,  // NEW
};
```

Update the `UseSearchReturn` type export (around line 52):

```typescript
export type UseSearchReturn = ReturnType<typeof useProjectSearch> & {
    searchMode: SearchMode;
    setSearchMode: (mode: SearchMode) => void;
    resultsOutsideProject: number;
};
```

### Testing for Hook Changes

Create `src/test/unit/search-helpers.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { findMatch } from "@/app/ui/hooks/useSearch.ts";

describe("findMatch - Search Term Matching", () => {
    it("matches substring case-insensitive", () => {
        const result = findMatch({
            textToSearch: "Hello World",
            searchTerm: "hello",
            matchCase: false,
            matchWholeWord: false,
        });
        
        expect(result.isMatch).toBe(true);
        expect(result.matchedTerm).toBe("Hello");
    });

    it("matches whole word with word boundaries", () => {
        const result = findMatch({
            textToSearch: "The cat sat on the mat",
            searchTerm: "at",
            matchCase: false,
            matchWholeWord: true,
        });
        
        expect(result.isMatch).toBe(false);
    });

    it("detects case mismatch", () => {
        const result = findMatch({
            textToSearch: "Noah walked with God",
            searchTerm: "noah",
            matchCase: false,
            matchWholeWord: false,
        });
        
        expect(result.isMatch).toBe(true);
        expect(result.matchedTerm).toBe("Noah");
    });
});
```

Run tests:
```bash
pnpm test:unit
```

---

## Phase 2: Workspace Context Integration

### File: `src/app/ui/contexts/WorkspaceContext.tsx`

#### Step 1: Pass Reference Files to Search Hook

Modify the `useProjectSearch` call (around line 127) to include `referenceFiles`:

```typescript
const search = useProjectSearch({
    workingFiles: mutWorkingFilesRef.current,
    referenceFiles: referenceProject.referenceQuery.data?.parsedFiles, // NEW
    saveCurrentDirtyLexical: actions.saveCurrentDirtyLexical,
    switchBookOrChapter: actions.switchBookOrChapter,
    editorRef,
    pickedFile: project.pickedFile,
    pickedChapter: project.pickedChapter,
});
```

**Context for Implementer:**
- `referenceProject.referenceQuery.data?.parsedFiles` contains the parsed files from the reference project when loaded
- The optional chaining (`?.`) handles the case when no reference project is loaded
- This data is already available via the existing `useReferenceProject` hook integration

### Testing for Context Changes

No separate unit tests needed. The E2E tests in Phase 4 will verify the integration.

---

## Phase 3: Search Panel UI Updates

### File: `src/app/data/constants.ts`

#### Step 1: Add Testing IDs

Add to the `TESTING_IDS` object (around line 25, after existing search IDs):

```typescript
searchModeSelect: "search-mode-select",
searchResultsOutsideAlert: "search-results-outside-alert",
```

### File: `src/app/ui/components/blocks/Search.tsx`

#### Step 1: Import Additional Components

Add `Select` and `Alert` to the Mantine imports (around line 2-16):

```typescript
import {
    ActionIcon,
    Alert,  // NEW
    Button,
    Checkbox,
    Drawer,
    darken,
    Group,
    Loader,
    type MantineTheme,
    Select,  // NEW
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from "@mantine/core";
```

#### Step 2: Update SearchControls Component

Modify the component to add the search mode dropdown and conditional rendering (around line 106):

```typescript
function SearchControls({ search }: { search: UseSearchReturn }) {
    const { t } = useLingui();
    const { referenceProject } = useWorkspaceContext(); // NEW
    const isSortActive = search.currentSort === "caseMismatch";
    
    // NEW: Determine if reference search is available
    const hasReferenceFiles = referenceProject.referenceQuery.data?.parsedFiles?.length > 0;

    return (
        <div className={searchClassNames.controls}>
            {/* NEW: SEARCH MODE SELECTOR */}
            <div className={searchClassNames.modeSelectSection}>
                <Select
                    data-testid={TESTING_IDS.searchModeSelect}
                    value={search.searchMode}
                    onChange={(value) => search.setSearchMode(value as "target" | "reference")}
                    data={[
                        { value: "target", label: t`Current Translation` },
                        { value: "reference", label: t`Reference Text` },
                    ]}
                    disabled={!hasReferenceFiles}
                    size="xs"
                    allowDeselect={false}
                />
            </div>

            {/* SEARCH INPUT - existing code */}
            <div className={searchClassNames.searchInputSection}>
                <TextInput
                    size="md"
                    radius="md"
                    value={search.searchTerm}
                    data-testid={TESTING_IDS.searchInput}
                    data-js="search-input"
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            search.onSearchChange(search.searchTerm);
                        }
                    }}
                    onChange={(e) =>
                        search.onSearchChange(e.currentTarget.value)
                    }
                    placeholder={t`Search`}
                    leftSection={<Search size={18} className="" />}
                    rightSectionWidth={search.isSearching ? 40 : 70}
                    rightSection={
                        search.isSearching ? (
                            <Loader size={20} />
                        ) : (
                            <Group gap={0} mr={4}>
                                <ActionIcon
                                    data-testid={TESTING_IDS.searchPrevButton}
                                    onClick={search.prevMatch}
                                    disabled={!search.hasPrev}
                                    variant="transparent"
                                    color="gray"
                                >
                                    <ChevronLeft size={18} />
                                </ActionIcon>
                                <ActionIcon
                                    data-testid={TESTING_IDS.searchNextButton}
                                    onClick={() => {
                                        search.nextMatch();
                                    }}
                                    disabled={!search.hasNext}
                                    variant="transparent"
                                    color="gray"
                                >
                                    <ChevronRight size={18} />
                                </ActionIcon>
                            </Group>
                        )
                    }
                />

                <Group gap="md">
                    <Checkbox
                        data-testid={TESTING_IDS.matchCaseCheckbox}
                        label={t`Match Case`}
                        checked={search.matchCase}
                        onChange={(e) =>
                            search.setMatchCase(e.currentTarget.checked)
                        }
                        size="xs"
                    />
                    <Checkbox
                        data-testid={TESTING_IDS.matchWholeWordCheckbox}
                        label={t`Whole Word`}
                        checked={search.matchWholeWord}
                        onChange={(e) =>
                            search.setMatchWholeWord(e.currentTarget.checked)
                        }
                        size="xs"
                    />
                </Group>
            </div>

            {/* REPLACE SECTION - conditional rendering */}
            {search.searchMode === "target" && (
                <div className={searchClassNames.replaceSection}>
                    <Text>
                        <Trans>Replace With:</Trans>
                    </Text>
                    <TextInput
                        data-testid={TESTING_IDS.replaceInput}
                        size="sm"
                        value={search.replaceTerm}
                        onChange={(e) =>
                            search.setReplaceTerm(e.currentTarget.value)
                        }
                        placeholder={t`Replace with...`}
                        leftSection={<Replace size={14} />}
                    />
                    <Group grow>
                        <Button
                            data-testid={TESTING_IDS.replaceButton}
                            size="xs"
                            variant="default"
                            onClick={search.replaceCurrentMatch}
                            disabled={!search.totalMatches}
                        >
                            {t`Replace`}
                        </Button>
                        <Button
                            data-testid={TESTING_IDS.replaceAllButton}
                            size="xs"
                            variant="default"
                            onClick={search.replaceAllInChapter}
                            disabled={!search.totalMatches}
                        >
                            {t`Replace all in this chapter`}
                        </Button>
                    </Group>
                </div>
            )}

            {/* STATS AND ALERTS */}
            <div className={searchClassNames.stats}>
                {/* NEW: ALERT FOR RESULTS OUTSIDE PROJECT */}
                {search.searchMode === "reference" && search.resultsOutsideProject > 0 && (
                    <Alert
                        data-testid={TESTING_IDS.searchResultsOutsideAlert}
                        variant="subtle"
                        color="blue"
                        mb="xs"
                        p="xs"
                    >
                        <Text size="xs">
                            <Trans>
                                {search.resultsOutsideProject} results found in books not in your project
                            </Trans>
                        </Text>
                    </Alert>
                )}

                {/* Sort Toggle */}
                <Group gap={6}>
                    <Tooltip
                        label={
                            isSortActive
                                ? t`Remove sort`
                                : t`Group case mismatches`
                        }
                        withArrow
                        position="top"
                    >
                        <ActionIcon
                            data-testid={TESTING_IDS.sortToggleButton}
                            size="sm"
                            variant={isSortActive ? "filled" : "light"}
                            color={isSortActive ? "orange" : "gray"}
                            onClick={() =>
                                search.sortBy(
                                    isSortActive ? "canonical" : "caseMismatch",
                                )
                            }
                            disabled={!search.totalMatches}
                        >
                            <ArrowUpDown size={14} />
                        </ActionIcon>
                    </Tooltip>

                    {isSortActive && (
                        <Text
                            data-testid={TESTING_IDS.searchCaseMismatchLabel}
                            size="xs"
                            c="orange"
                            fw={600}
                            style={{ lineHeight: 1 }}
                        >
                            {t`Case mismatches first`} (
                            {search.numCaseMismatches})
                        </Text>
                    )}
                </Group>

                {/* Counts */}
                <Stack gap={0}>
                    <span data-testid={TESTING_IDS.searchStats}>
                        {search.pickedResultIdx >= 0
                            ? `${search.pickedResultIdx + 1} of ${search.results.length} results`
                            : `${search.results.length} results`}
                    </span>
                </Stack>
            </div>
        </div>
    );
}
```

#### Step 3: Add CSS Styles

**File: `src/app/ui/styles/modules/Search.module.css.ts`**

Add a new section for the mode selector (check existing structure first, likely around line 50-100):

```typescript
modeSelectSection: {
    paddingBottom: "var(--mantine-spacing-xs)",
    marginBottom: "var(--mantine-spacing-xs)",
    borderBottom: "1px solid var(--mantine-color-gray-3)",
},
```

**Context for Implementer:**
- The `Select` component from Mantine provides a dropdown interface
- `disabled={!hasReferenceFiles}` ensures users can't select reference mode when no reference is loaded
- The conditional `{search.searchMode === "target" && (...)}` hides replace controls in reference mode
- The `Alert` component provides a clear, dismissible message about filtered results
- `useWorkspaceContext()` is already imported at the top of `SearchPanel`; we need to destructure `referenceProject` from it in `SearchControls`

### Component Testing

**Prerequisite Setup:**
Ensure Vitest Browser Mode is configured. Check `vitest.config.ts` and add if needed:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    browser: {
      enabled: true,
      name: 'chrome',
      provider: 'playwright',
    },
  },
})
```

Install testing library if not present:
```bash
pnpm add -D @testing-library/react vitest-browser-react
```

**Create `src/test/components/SearchPanel.test.tsx`:**

```typescript
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { SearchPanel } from "@/app/ui/components/blocks/Search.tsx";
import { WorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import { TESTING_IDS } from "@/app/data/constants.ts";

// Mock context
const mockContextValue = {
    editorRef: { current: null },
    settingsManager: {} as any,
    allProjects: [],
    currentProjectRoute: "/test",
    project: {
        pickedFile: { bookCode: "MAT" } as any,
        pickedChapter: { chapNumber: 1 } as any,
    } as any,
    actions: {
        switchBookOrChapter: jest.fn(),
        saveCurrentDirtyLexical: jest.fn(() => []),
    } as any,
    referenceProject: {
        referenceQuery: {
            data: {
                parsedFiles: [
                    { bookCode: "GEN", chapters: [] },
                    { bookCode: "MAT", chapters: [] },
                ],
            },
        },
    } as any,
    search: {
        isSearchPaneOpen: true,
        searchMode: "target" as const,
        setSearchMode: jest.fn(),
        searchTerm: "",
        onSearchChange: jest.fn(),
        matchCase: false,
        setMatchCase: jest.fn(),
        matchWholeWord: false,
        setMatchWholeWord: jest.fn(),
        replaceTerm: "",
        setReplaceTerm: jest.fn(),
        results: [],
        replaceCurrentMatch: jest.fn(),
        replaceAllInChapter: jest.fn(),
        sortBy: jest.fn(),
        currentSort: "canonical" as const,
        pickedResult: null,
        pickedResultIdx: -1,
        totalMatches: 0,
        numCaseMismatches: 0,
        hasNext: false,
        hasPrev: false,
        resultsOutsideProject: 0,
    } as any,
    lint: {} as any,
    cssStyleSheet: {} as any,
    saveDiff: {} as any,
    projectLanguageDirection: "ltr",
    bookCodeToProjectLocalizedTitle: jest.fn(),
};

describe("SearchPanel - Component Tests", () => {
    it("renders search mode dropdown when reference files available", async () => {
        render(
            <WorkspaceContext.Provider value={mockContextValue}>
                <SearchPanel />
            </WorkspaceContext.Provider>
        );

        const modeSelect = page.getByTestId(TESTING_IDS.searchModeSelect);
        await expect.element(modeSelect).toBeInTheDocument();
        
        const selectElement = modeSelect.element();
        expect(selectElement).not.toBeDisabled();
    });

    it("disables search mode dropdown when no reference files", async () => {
        const noRefContext = {
            ...mockContextValue,
            referenceProject: {
                referenceQuery: { data: { parsedFiles: [] } },
            } as any,
        };

        render(
            <WorkspaceContext.Provider value={noRefContext}>
                <SearchPanel />
            </WorkspaceContext.Provider>
        );

        const modeSelect = page.getByTestId(TESTING_IDS.searchModeSelect);
        await expect.element(modeSelect).toBeInTheDocument();
        
        const selectElement = modeSelect.element();
        expect(selectElement).toBeDisabled();
    });

    it("hides replace controls in reference mode", async () => {
        const referenceModeContext = {
            ...mockContextValue,
            search: {
                ...mockContextValue.search,
                searchMode: "reference" as const,
            },
        };

        render(
            <WorkspaceContext.Provider value={referenceModeContext}>
                <SearchPanel />
            </WorkspaceContext.Provider>
        );

        const replaceInput = page.getByTestId(TESTING_IDS.replaceInput);
        await expect.element(replaceInput).not.toBeInTheDocument();
    });

    it("shows alert when results exist outside project", async () => {
        const alertContext = {
            ...mockContextValue,
            search: {
                ...mockContextValue.search,
                searchMode: "reference" as const,
                resultsOutsideProject: 5,
            },
        };

        render(
            <WorkspaceContext.Provider value={alertContext}>
                <SearchPanel />
            </WorkspaceContext.Provider>
        );

        const alert = page.getByTestId(TESTING_IDS.searchResultsOutsideAlert);
        await expect.element(alert).toBeInTheDocument();
        await expect.element(alert).toHaveTextContent(/results found in books not in your project/);
    });

    it("handles mode switching", async () => {
        const setSearchModeMock = jest.fn();
        const interactiveContext = {
            ...mockContextValue,
            search: {
                ...mockContextValue.search,
                setSearchMode: setSearchModeMock,
            },
        };

        render(
            <WorkspaceContext.Provider value={interactiveContext}>
                <SearchPanel />
            </WorkspaceContext.Provider>
        );

        const modeSelect = page.getByTestId(TESTING_IDS.searchModeSelect);
        await modeSelect.selectOption("reference");

        expect(setSearchModeMock).toHaveBeenCalledWith("reference");
    });
});
```

Run component tests:
```bash
pnpm test --browser
```

---

## Phase 4: E2E Testing

### File: `src/test/e2e/editor.spec.ts`

Add new tests to the existing `test.describe("Search Functionality", () => {` block (around line 578, after existing tests):

```typescript
test.describe("Search Functionality", () => {
    // ... all existing tests remain unchanged ...
    
    test("sort toggle shows case mismatches first", async ({ editorPage }) => {
        // ... existing test ...
    });

    // ========== NEW REFERENCE MODE TESTS ==========
    
    test("search mode dropdown is disabled without reference project", async ({
        editorPage,
    }) => {
        await editorPage.getByTestId(TESTING_IDS.searchTrigger).click();
        
        const modeSelect = editorPage.getByTestId(TESTING_IDS.searchModeSelect);
        await expect(modeSelect).toBeVisible();
        await expect(modeSelect).toBeDisabled();
    });

    test("search mode dropdown enables after loading reference project", async ({
        editorWithTwoProjects: page,
    }) => {
        // First verify dropdown is disabled (no reference loaded)
        await page.getByTestId(TESTING_IDS.searchTrigger).click();
        const modeSelect = page.getByTestId(TESTING_IDS.searchModeSelect);
        await expect(modeSelect).toBeDisabled();
        
        // Load a reference project
        const refTrigger = page.getByTestId(TESTING_IDS.referenceProjectTrigger);
        await refTrigger.click();
        await page.getByTestId(TESTING_IDS.referenceProjectDropdown).waitFor({
            state: "visible",
        });
        await page.getByTestId(TESTING_IDS.referenceProjectItem).first().click();
        
        // Verify dropdown is now enabled
        await expect(modeSelect).toBeEnabled();
    });

    test("search in reference mode navigates to target text", async ({
        editorWithTwoProjects: page,
    }) => {
        // Load reference project
        const refTrigger = page.getByTestId(TESTING_IDS.referenceProjectTrigger);
        await refTrigger.click();
        await page.getByTestId(TESTING_IDS.referenceProjectItem).first().click();
        
        // Open search panel
        await page.getByTestId(TESTING_IDS.searchTrigger).click();
        
        // Switch to reference mode
        const modeSelect = page.getByTestId(TESTING_IDS.searchModeSelect);
        await modeSelect.selectOption({ label: "Reference Text" });
        
        // Search for a term
        await page.getByTestId(TESTING_IDS.searchInput).fill("Jisu");
        
        // Wait for results
        const results = page.getByTestId(TESTING_IDS.searchResultItem);
        await results.first().waitFor({ state: "visible" });
        
        // Click a result
        await results.first().click();
        
        // Verify we're still in the target editor (not reference)
        const targetEditor = page.getByTestId(TESTING_IDS.mainEditorContainer);
        await expect(targetEditor).toBeVisible();
    });

    test("replace controls are hidden in reference mode", async ({
        editorWithTwoProjects: page,
    }) => {
        // Load reference project
        const refTrigger = page.getByTestId(TESTING_IDS.referenceProjectTrigger);
        await refTrigger.click();
        await page.getByTestId(TESTING_IDS.referenceProjectItem).first().click();
        
        await page.getByTestId(TESTING_IDS.searchTrigger).click();
        
        // First verify replace controls are visible in target mode
        await expect(page.getByTestId(TESTING_IDS.replaceInput)).toBeVisible();
        await expect(page.getByTestId(TESTING_IDS.replaceButton)).toBeVisible();
        await expect(page.getByTestId(TESTING_IDS.replaceAllButton)).toBeVisible();
        
        // Switch to reference mode
        const modeSelect = page.getByTestId(TESTING_IDS.searchModeSelect);
        await modeSelect.selectOption({ label: "Reference Text" });
        
        // Verify all replace controls are now hidden
        await expect(page.getByTestId(TESTING_IDS.replaceInput)).not.toBeVisible();
        await expect(page.getByTestId(TESTING_IDS.replaceButton)).not.toBeVisible();
        await expect(page.getByTestId(TESTING_IDS.replaceAllButton)).not.toBeVisible();
    });

    test("alert shows for results in non-target books", async ({
        editorWithTwoProjects: page,
    }) => {
        // Load reference project
        const refTrigger = page.getByTestId(TESTING_IDS.referenceProjectTrigger);
        await refTrigger.click();
        await page.getByTestId(TESTING_IDS.referenceProjectItem).first().click();
        
        await page.getByTestId(TESTING_IDS.searchTrigger).click();
        await page.getByTestId(TESTING_IDS.searchModeSelect).selectOption({ label: "Reference Text" });
        
        // Search for a term that appears in books not in target (e.g., "Adam" in GEN when target is MAT only)
        await page.getByTestId(TESTING_IDS.searchInput).fill("Adam");
        
        // Wait for results and alert
        const alert = page.getByTestId(TESTING_IDS.searchResultsOutsideAlert);
        await expect(alert).toBeVisible();
        await expect(alert).toContainText(/results found in books not in your project/);
    });

    test("switching between modes preserves search term", async ({
        editorWithTwoProjects: page,
    }) => {
        // Load reference project
        const refTrigger = page.getByTestId(TESTING_IDS.referenceProjectTrigger);
        await refTrigger.click();
        await page.getByTestId(TESTING_IDS.referenceProjectItem).first().click();
        
        await page.getByTestId(TESTING_IDS.searchTrigger).click();
        
        // Search in target mode
        const searchInput = page.getByTestId(TESTING_IDS.searchInput);
        await searchInput.fill("vola");
        
        // Get initial results count
        await page.getByTestId(TESTING_IDS.searchResultItem).first().waitFor({ state: "visible" });
        const targetResultsCount = await page
            .getByTestId(TESTING_IDS.searchResultsContainer)
            .getAttribute("data-num-search-results");
        console.log(`Target mode results: ${targetResultsCount}`);
        
        // Switch to reference mode
        const modeSelect = page.getByTestId(TESTING_IDS.searchModeSelect);
        await modeSelect.selectOption({ label: "Reference Text" });
        
        // Verify search term is preserved
        await expect(searchInput).toHaveValue("vola");
        
        // Results should update to reference text
        await page.getByTestId(TESTING_IDS.searchResultItem).first().waitFor({ state: "visible" });
        const refResultsCount = await page
            .getByTestId(TESTING_IDS.searchResultsContainer)
            .getAttribute("data-num-search-results");
        console.log(`Reference mode results: ${refResultsCount}`);
        
        // Counts may be different, but search term should be same
        await expect(searchInput).toHaveValue("vola");
    });
});
```

Run E2E tests:
```bash
pnpm test.e2e
```

---

## Implementation Checklist

- [ ] Phase 1: Hook Modifications
  - [ ] Add `SearchMode` type
  - [ ] Update `Props` to include `referenceFiles`
  - [ ] Add `searchMode` and `resultsOutsideProject` state
  - [ ] Update `SearchResult` type with `searchedIn` field
  - [ ] Modify `runSearchLogic` for dual search modes
  - [ ] Add filtering for non-target books in reference mode
  - [ ] Guard `replaceCurrentMatch` and `replaceAllInChapter`
  - [ ] Update return values
  - [ ] Update `UseSearchReturn` type

- [ ] Phase 2: Context Integration
  - [ ] Pass `referenceFiles` to `useProjectSearch` in `WorkspaceContext.tsx`

- [ ] Phase 3: UI Updates
  - [ ] Add testing IDs to constants
  - [ ] Import `Select` and `Alert` components
  - [ ] Add search mode dropdown to `SearchControls`
  - [ ] Add conditional rendering for replace controls
  - [ ] Add alert for results outside project
  - [ ] Add CSS styles for mode selector section

- [ ] Testing
  - [ ] Unit tests for `findMatch` function
  - [ ] Component tests with vitest-browser-react
  - [ ] E2E tests extending existing search suite
  - [ ] Verify all existing tests still pass (regression)

---

## Engineering Principles Applied

1. **DRY (Don't Repeat Yourself):**
   - Reuses existing `runSearchLogic` structure with mode-based branching
   - Leverages existing `findMatch` helper function
   - Follows existing component patterns

2. **YAGNI (You Aren't Gonna Need It):**
   - Only adds features specified in design (no extra complexity)
   - Context menu integration deferred to future scope
   - Testing library only added if needed for component tests

3. **TDD (Test-Driven Development):**
   - Unit tests written for pure functions before implementation
   - Component tests validate UI behavior
   - E2E tests verify complete workflows

4. **Hexagonal Architecture Compliance:**
   - Core logic remains in `useSearch` hook (app layer)
   - No imports from `src/app` into `src/core`
   - UI components depend on hooks, not direct implementation

5. **Frequent Commits:**
   - Recommended to commit after each phase:
     - Phase 1: Hook changes and unit tests
     - Phase 2: Context integration
     - Phase 3: UI updates and component tests
     - Phase 4: E2E tests

---

## Notes for Implementer

### Dependencies to Install (if not present)
```bash
pnpm add -D @testing-library/react vitest-browser-react
```

### Vitest Browser Mode Configuration
If browser mode is not already configured, add to `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    browser: {
      enabled: true,
      name: 'chrome',
      provider: 'playwright',
    },
  },
})
```

### Key Design Decisions
1. **Search dropdown placement**: Above search input for discoverability
2. **Alert positioning**: Below stats for clear visibility
3. **Replace control hiding**: Conditional rendering rather than CSS display for cleaner code
4. **Reference-only filtering**: Done in `runSearchLogic` to avoid post-processing results

### Performance Considerations
- No performance impact on existing target mode searches
- Reference searches use same debouncing (500ms) as target searches
- Same virtualization for large result sets
- `resultsOutsideProject` counter uses simple integer increment

### Accessibility
- `Select` component is accessible by default (Mantine)
- `Alert` component provides proper ARIA attributes
- Keyboard navigation works for dropdown (Mantine default)
- Screen readers announce mode changes naturally

---

## Verification Steps

After implementation, verify:

1. **Manual Testing:**
   - Load a reference project
   - Open search panel, verify dropdown is enabled
   - Switch to reference mode, verify replace controls hidden
   - Search for a term, verify results appear
   - Click a result, verify navigation to target text
   - Switch back to target mode, verify replace controls reappear

2. **Automated Testing:**
   ```bash
   pnpm test:unit
   pnpm test --browser
   pnpm test.e2e
   ```

3. **Linting and Type Checking:**
   ```bash
   pnpm check
   pnpm run format
   ```

4. **Build Verification:**
   ```bash
   pnpm build.web
   pnpm build.tauri
   ```

---

## Next Steps

After implementation is complete and verified:
1. Update the find-and-replace spec document to reflect the new feature
2. Archive the design document to `plans/archived/`
3. Archive this implementation plan to `plans/archived/`
