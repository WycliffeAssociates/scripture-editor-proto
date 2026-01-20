# Test Refactoring Plan (Revised)

## Background
Inspired by Kent C. Dodds' Testing Trophy philosophy:
- [Static vs Unit vs Integration vs E2E Tests](https://kentcdodds.com/blog/static-vs-unit-vs-integration-vs-e2e-tests)
- [The Testing Trophy and Testing Classifications](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [How to Know What to Test](https://kentcdodds.com/blog/how-to-know-what-to-test)
- [Vitest Browser Mode vs Playwright](https://www.epicweb.dev/vitest-browser-mode-vs-playwright)

## Core Philosophy (from `.opencode/skill/testing/SKILL.md`)

1. **Confidence over Coverage** - We chase confidence, not 100% coverage
2. **Avoid Implementation Details** - Test observable output, not internal state
3. **The User is King** - Tests should resemble how the software is used
4. **Refactor Friendly** - If you refactor and the test breaks but the app works, the test was bad

## Current State Analysis

### Test Summary
- **14 unit/integration test files**, **9 E2E spec files**
- **139/140 tests passing** (1 failing in `lexicalToUsfm.test.ts`)
- **1 warning** (un-awaited promise in `WebHandles.test.ts:773`)

### Test Files Assessment

| File | Tests | Assessment | Action |
|------|-------|------------|--------|
| `testEditor.test.ts` | 4 | Tests helper utility that creates headless editors for other tests. Has duplicate test case. | FIX duplicate test, keep file |
| `constants.test.ts` | 11 | Tests `TEST_ID_GENERATORS` used by E2E tests for reliable selectors | KEEP - ensures E2E test stability |
| `cursorCorrection.test.ts` | 11 | Tests important cursor behavior in Lexical editor | KEEP - high-risk editor behavior |
| `search.utils.test.ts` | 37 | Pure function unit tests for search - excellent! | KEEP ✅ |
| `ProjectIndexer.test.ts` | 5 | Tests existence of class and method signatures, not behavior | REVIEW - weak tests |
| `lexicalToUsfm.test.ts` | 6 | Tests USFM serialization logic - 1 failing | FIX failing test |
| `ProjectLoader.test.ts` | 3 | Tests project format detection and loader dispatch | KEEP - high-risk persistence |
| `ScriptureBurritoProjectLoader.test.ts` | 4 | Tests Scripture Burrito metadata loading | KEEP ✅ |
| `ResourceContainerProjectLoader.test.ts` | 8 | Tests Resource Container manifest loading | KEEP ✅ |
| `ProjectRepository.test.ts` | 2 | Tests project persistence | KEEP - high-risk |
| `TauriDirectoryProvider.test.ts` | 8 | Tests Tauri filesystem integration with mocks | KEEP - platform-specific |
| `WebHandles.test.ts` | 27 | Tests OPFS file/directory handles - has warning | FIX warning |
| `LanguageApiImporter.test.ts` | 10 | Tests remote project import API | KEEP ✅ |
| `WacsRepoImporter.test.ts` | 4 | Tests WACS repository download - noisy stderr | REVIEW - noisy mocks |

### Key Problems Identified

1. **Failing test** (`lexicalToUsfm.test.ts:135`) - expects 4 nodes, gets 1
2. **Duplicate test** (`testEditor.test.ts` has identical test at lines 8 and 24)
3. **Un-awaited promise** (`WebHandles.test.ts:773`)
4. **Noisy mocks** (`WacsRepoImporter.test.ts` logs errors to stderr)
5. **Weak tests** (`ProjectIndexer.test.ts` tests method signatures, not behavior)

### What's Already Good ✅

- **E2E tests** follow testing-library patterns (`getByTestId`, `getByRole`, user interactions)
- **Pure function tests** (`search.utils.test.ts`) - clean input→output
- **High-risk area coverage** (ProjectLoader, persistence, file handles)
- **Platform-specific tests** (Tauri vs Web implementations)

## High-Risk Areas (Must Test)

Per the testing skill, these areas MUST have tests:
- **Save logic** - covered by E2E `save.spec.ts`
- **Core Parsers** - covered by `lexicalToUsfm.test.ts`, serialization tests
- **Project Loaders** - covered by `ProjectLoader.test.ts`, `ScriptureBurritoProjectLoader.test.ts`
- **Data persistence** - covered by `ProjectRepository.test.ts`, `WebHandles.test.ts`

## Refactoring Principles

1. **Fix before delete** - Fix failing/broken tests first
2. **Strengthen weak tests** - If a test exists, make it meaningful
3. **Reduce noise** - Mock console.error where appropriate
4. **Remove duplication** - One test per behavior
5. **Follow testing-library queries** - Prefer `getByRole`, `getByText` over implementation

## Constraints

- Rate-limited model, work incrementally
- Keep tests passing after each change
- Document decisions in progress file
