# 2025-01-08 Codebase Cleanup & Refactor Design

## Overview

This design outlines a comprehensive cleanup and refactoring initiative for the Dovetail Scripture Editor codebase. The goal is to improve code quality, maintainability, and developer experience without changing any functional semantics. This focuses on removing technical debt, improving type safety, eliminating duplication, and ensuring React Fast Refresh compatibility.

## 1. TypeScript Type Safety Improvements

### Current Issues Identified:
- Multiple instances of `any` types across the codebase, primarily in test files and some in production code
- Some type assertions that could be made more type-safe

### Solutions:
1. **Eliminate `any` types in production code**
   - Replace the `any` type assertion in `USFMPlugin.tsx` line 52 with proper type guards
   - Create proper type definitions for Tauri stream abort handling

2. **Keep test file `any` types intentional**
   - Test files use `any` for mocking purposes - this is acceptable and should remain
   - Document why these are necessary in comments

## 2. React Fast Refresh Compliance

### Current Issues:
Multiple `.tsx` files are exporting utilities alongside React components, which breaks Fast Refresh:

**Critical offenders:**
- `USFMPlugin.tsx` - exports 4 utility functions + 1 component
- `USFMNestedEditorNode.tsx` - exports 10+ utilities/types + 1 component class
- Various hook files exporting type aliases alongside hooks
- Context files exporting providers and hooks together

### Solution Strategy:
**File Splitting Pattern:**
```
src/app/domain/editor/
├── plugins/
│   ├── USFMPlugin.tsx (component only)
│   └── usfmPluginUtils.ts (utilities)
├── nodes/
│   ├── USFMNestedEditorNode.tsx (component only)
│   └── usfmNestedEditorNodeTypes.ts (types & utilities)
```

**New Convention:**
- `.tsx` files export ONLY React components (classes/functions that return JSX)
- `.ts` files export utilities, types, hooks, and constants
- Component files can import from their corresponding utility files

## 3. Function Size and Single Responsibility

### Current Issues:
- `USFMPlugin.tsx`: The main plugin function is ~226 lines with multiple concerns
- Several editor listener functions are doing too much
- Mixed concerns in useEffect hooks

### Refactoring Strategy:
**Extract Concerns:**
1. **Plugin Registration Management** - Extract registration logic
2. **Debounced Operations** - Group related debounced functions
3. **Event Handler Registration** - Separate command/transform registration
4. **Cleanup Coordination** - Centralize cleanup logic

**Target Function Size:**
- Functions should be under 50 lines where possible
- Each function should have a single, clear responsibility
- Use composition over monolithic functions

## 4. Type Duplication and Consolidation

### Identified Patterns:
- Similar interface definitions across multiple files
- Duplicate utility types in different modules
- Inconsistent naming conventions for related types

### Consolidation Plan:
1. **Create type consolidation modules:**
   - `src/app/types/editor/` - Editor-specific types
   - `src/app/types/ui/` - UI component types
   - `src/core/types/` - Core domain types

2. **Standardize naming:**
   - Props interfaces: `ComponentNameProps`
   - Hook return types: `UseHookNameReturn`
   - Context types: `ContextNameContextType`

## 5. Import Organization and Dead Code

### Current Issues:
- Potential unused imports (need Biome to verify)
- Inconsistent import ordering
- Mixed default/named imports

### Cleanup Strategy:
1. **Run Biome's import organizer** to fix ordering
2. **Remove unused imports** after file reorganization
3. **Standardize import patterns:**
   - External libraries first
   - Internal `@/` imports second
   - Relative imports last
   - Type imports grouped separately

## 6. Console Statement Cleanup

### Current State:
31 console statements across the codebase, primarily for debugging

### Strategy:
1. **Keep intentional logging**: Performance timing (`console.time`) is intentional
2. **Remove debug logs**: Simple `console.log` statements should be removed
3. **Add conditional logging**: Use environment-based logging for production vs development

## 7. File Organization and Structure

### Current Inconsistencies:
- Mixed file naming conventions (PascalCase vs camelCase)
- Utilities scattered across multiple directories
- Inconsistent directory structure

### Improvements:
1. **Standardize file naming:**
   - Components: `PascalCase.tsx`
   - Utilities: `camelCase.ts`
   - Types: `camelCase.types.ts`
   - Constants: `UPPER_SNAKE_CASE.ts`

2. **Reorganize utilities:**
   - `src/app/utils/` - App-level utilities
   - `src/app/utils/editor/` - Editor-specific utilities
   - `src/core/utils/` - Core domain utilities

## Implementation Approach

This refactor will be executed systematically:

1. **Phase 1**: Fast Refresh compliance (file splitting)
2. **Phase 2**: Type safety improvements  
3. **Phase 3**: Function decomposition and single responsibility
4. **Phase 4**: Type consolidation and deduplication
5. **Phase 5**: Import organization and dead code removal
6. **Phase 6**: Console cleanup and final polish

Each phase will maintain 100% functional compatibility - no changes to behavior, only structure and type safety improvements.

## Success Criteria

- Eliminated `any` types in production code (keeping test `any`s where appropriate)
- All `.tsx` files export only React components
- All functions under 50 lines (where practical)
- No duplicate type definitions
- Biome passes with zero import/organization issues
- Console statements reduced to intentional logging only
- All tests continue to pass without modification