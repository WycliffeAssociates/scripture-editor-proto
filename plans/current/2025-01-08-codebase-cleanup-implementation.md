# 2025-01-08 Codebase Cleanup & Refactor Implementation Plan

## Goal
Comprehensive codebase cleanup and refactor focusing on type safety, React Fast Refresh compliance, function size reduction, and elimination of technical debt - zero semantic changes.

## Constraints & Invariants
- **Zero functional changes** - all tests must pass without modification
- **Maintain Hexagonal Architecture** - Core/App boundary strictness
- **Biome compliance** - all linting/formatting rules must pass
- **React Fast Refresh** - only export components from .tsx files
- **Type safety** - eliminate `any` types in production code

## Repo Anchors & Prior Art

### Truth Files
- `biome.jsonc` - Current linting/formatting rules
- `tsconfig.json` - TypeScript configuration and strictness settings
- `src/app/data/editor.ts` - Core editor type definitions (reuse patterns)

### Patterns to Reuse
- Existing type extraction patterns in `src/app/domain/editor/nodes/`
- Utility organization in `src/core/data/utils/`
- Hook patterns in `src/app/ui/hooks/`

### Files Requiring Special Attention
- `src/app/domain/editor/plugins/USFMPlugin.tsx` - Multiple exported utilities
- `src/app/domain/editor/nodes/USFMNestedEditorNode.tsx` - Mixed exports
- Test files with intentional `any` types - DO NOT CHANGE

## Incremental Implementation Strategy

This refactor will be executed **incrementally with user visibility** - each change should be small enough for review and understanding:

### Incremental Strategy:
- **One small file at a time** - never batch multiple files in a single commit
- **User-visible commits** - each change should be clearly understandable
- **Frequent testing** - run tests after each individual file change
- **Gradual phases** - move to next phase only after current phase is complete and reviewed

### Example Commit Strategy:
```
feat: Split USFMPlugin utilities to separate file for Fast Refresh
fix: Replace any type with proper TokenName in usfmPluginUtils.ts
refactor: Decompose USFMPlugin main function into smaller concerns
refactor: Consolidate duplicate editor types into editorTypes.ts
refactor: Organize imports in maintainDocumentStructure.ts
refactor: Remove debug console statements from editor listeners
```

Each phase will maintain 100% functional compatibility - no changes to behavior, only structure and type safety improvements. The user should be able to review and understand each individual commit.

## Phase 1: React Fast Refresh Compliance

### 1.1 Split USFMPlugin utilities
**Files to touch:**
- Create: `src/app/domain/editor/plugins/usfmPluginUtils.ts`
- Modify: `src/app/domain/editor/plugins/USFMPlugin.tsx`

**Steps:**
1. Move these functions to new utility file:
   - `isNodeLocked()`
   - `findNextEditableNode()`
   - `findPreviousEditableNode()`
   - `correctCursorIfNeeded()`
2. Update USFMPlugin.tsx to import utilities
3. Export ONLY `USFMPlugin` component from .tsx file
4. Update any imports in other files

### 1.2 Split USFMNestedEditorNode types/utilities
**Files to touch:**
- Create: `src/app/domain/editor/nodes/usfmNestedEditorNodeTypes.ts`
- Modify: `src/app/domain/editor/nodes/USFMNestedEditorNode.tsx`

**Steps:**
1. Move these to new types file:
   - `USFM_NESTED_DECORATOR_TYPE`
   - `nestedEditorMarkers`
   - `USFMNestedEditorNodeJSON` type
   - `USFMNestedEditorNodeMetadata` type
   - All utility functions (create, is, get, etc.)
2. Keep only `USFMNestedEditorNode` class in .tsx file
3. Update imports across codebase

### 1.3 Split Context exports
**Files to touch:**
- `src/app/ui/contexts/Md5Context.tsx`
- `src/app/ui/contexts/WorkspaceContext.tsx`
- `src/app/ui/contexts/PersistenceContext.tsx`
- `src/app/ui/contexts/MediaQuery.tsx`

**Steps:**
For each context file:
1. Move Provider component to stay in .tsx
2. Move hook exports to corresponding `.ts` files
3. Update import statements in consuming components

### 1.4 Split Hook exports with types
**Files to touch:**
- `src/app/ui/hooks/useDynamicStyles.tsx`
- `src/app/ui/hooks/useSave.tsx`
- `src/app/ui/hooks/useWorkspaceState.tsx`
- `src/app/ui/hooks/useActions.tsx`
- `src/app/ui/hooks/useLint.tsx`
- `src/app/ui/hooks/useSearch.tsx`
- `src/app/ui/hooks/useReferenceProject.tsx`

**Steps:**
For each hook file:
1. Keep only the hook function in .tsx
2. Move type exports (`UseHookNameReturn`, etc.) to .ts files
3. Update imports

### 1.5 Split Component utilities
**Files to touch:**
- `src/app/ui/components/blocks/SearchTrigger.tsx`
- `src/app/ui/components/blocks/Search.tsx`
- `src/app/ui/components/primitives/HistoryButton.tsx`
- `src/app/ui/components/primitives/FileDirImporter.tsx`

**Steps:**
1. Extract utility functions to separate .ts files
2. Keep only React components in .tsx files
3. Update imports

## Phase 2: Type Safety Improvements

### 2.1 Eliminate production `any` types
**Files to touch:**
- `src/app/domain/editor/plugins/usfmPluginUtils.ts` (moved from USFMPlugin.tsx)
- `src/tauri/io/TauriFileHandle.ts`
- `src/core/data/utils/generic.ts`
- `src/core/domain/project/scriptureBurritoHelpers.ts`

**Steps:**
1. **USFMPlugin tokenType any**: Replace with proper type guard:
   ```typescript
   // Before: return TOKENS_TO_LOCK_FROM_EDITING.has(tokenType as any);
   // After: return TOKENS_TO_LOCK_FROM_EDITING.has(tokenType as TokenName);
   ```
2. **TauriFileHandle abort any**: Create proper AbortSignal type
3. **Generic debounce any**: Already properly typed with generics - add comment
4. **ScriptureBurrito helpers**: Define proper interface for ingredientData

### 2.2 Keep test file `any` types unchanged
**Files NOT to modify:**
- All files in `src/test/` directory
- Mock files with intentional `any` types

Add comments explaining why `any` is acceptable in these contexts.

## Phase 3: Function Decomposition

### 3.1 Refactor USFMPlugin main function
**File to touch:**
- `src/app/domain/editor/plugins/USFMPlugin.tsx`

**Current issue:** 226-line function with multiple concerns

**Refactoring steps:**
1. Extract registration setup:
   ```typescript
   function setupUpdateListeners(editor, config) { /* registration logic */ }
   function setupNodeTransforms(editor, config) { /* transform logic */ }
   function setupCommands(editor, config) { /* command logic */ }
   ```

2. Extract cleanup coordination:
   ```typescript
   function createCleanupFunction(allUnregisterFunctions) { /* cleanup logic */ }
   ```

3. Extract debounced operations:
   ```typescript
   function createDebouncedOperations(editor, actions, lint) { /* return debounced fxns */ }
   ```

4. Main component becomes composition:
   ```typescript
   export function USFMPlugin() {
     const [editor] = useLexicalComposerContext();
     const config = getPluginConfig(useWorkspaceContext());
     
     const debouncedOps = createDebouncedOperations(editor, config);
     const cleanupFunctions = registerAllEditorListeners(editor, config, debouncedOps);
     
     useEffect(() => cleanupFunctions, [config]);
     return null;
   }
   ```

### 3.2 Decompose large editor listeners
**Files to touch:**
- `src/app/domain/editor/listeners/maintainDocumentStructure.ts`
- `src/app/domain/editor/listeners/maintainMetadata.ts`

**Steps:**
1. Break down functions >50 lines
2. Extract helper functions
3. Ensure single responsibility per function

## Phase 4: Type Consolidation

### 4.1 Create type consolidation modules
**New files to create:**
- `src/app/types/editor/editorTypes.ts`
- `src/app/types/ui/componentTypes.ts`
- `src/core/types/domainTypes.ts`

**Steps:**
1. Move duplicate types to consolidation modules
2. Update all imports to use consolidated types
3. Remove duplicate definitions
4. Ensure consistent naming conventions

### 4.2 Standardize type naming
**Pattern to apply:**
- Component props: `ComponentNameProps`
- Hook returns: `UseHookNameReturn`
- Context types: `ContextNameContextType`
- Event handlers: `EventNameHandler`

## Phase 5: Import Organization & Dead Code

### 5.1 Run Biome import organizer
**Command to run:**
```bash
pnpm biome --write --only=organize-imports src/
```

### 5.2 Remove unused imports
**Steps:**
1. After file reorganization, run Biome to identify unused imports
2. Remove unused imports systematically
3. Verify no functionality is broken

### 5.3 Standardize import patterns
**Enforce this order:**
1. External libraries (React, Lexical, etc.)
2. Internal `@/` imports
3. Relative imports (`./`, `../`)
4. Type imports grouped separately

## Phase 6: Console Cleanup

### 6.1 Analyze console statements
**Current count:** 31 console statements

**Classification:**
- Keep: `console.time`/`console.timeEnd` (performance monitoring)
- Remove: Debug `console.log` statements
- Replace: Development-only logging with conditional logging

### 6.2 Remove debug logs
**Files to touch:**
- Search for `console.log` statements not related to performance
- Remove them safely

### 6.3 Add conditional logging (if needed)
**Pattern to use:**
```typescript
const debug = import.meta.env.DEV;
if (debug) console.log('Debug info');
```

## Testing & Verification

### Verification Steps for Each Phase:
1. **Unit Tests:** `pnpm test:unit` must pass
2. **Linting:** `pnpm biome` must pass with zero errors
3. **Type Checking:** `tsc --noEmit` must pass
4. **Build:** `pnpm build` must succeed
5. **E2E Tests:** `pnpm test:e2e` must pass (no behavior changes)

### Specific Verification Points:
- After Fast Refresh changes: Verify React DevTools Fast Refresh works
- After type changes: Verify no runtime type errors
- After function decomposition: Verify all editor functionality works
- After import cleanup: Verify no missing dependencies

## Rollback Strategy
Each phase creates atomic commits. If any phase introduces issues:
1. Identify the problematic commit
2. Revert that specific commit
3. Continue with remaining phases

## Success Metrics
- Zero `any` types in production code
- All `.tsx` files export only React components
- All functions under 50 lines (where practical)
- Biome passes with zero import/organization issues
- Console statements reduced to performance monitoring only
- All tests pass without modification
- No changes to application behavior or features