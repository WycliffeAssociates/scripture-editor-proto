# Scripture Editor Prototype

A scripture editing application built with Tauri, React, and TypeScript in Vite.

## Project Structure

This project is organized into three main directories:

- `src-core/`: Core library with domain models, data structures, and utility functions
- `src/`: Client UI code with React components
- `src-tauri/`: Tauri-specific code for the desktop application

## Key Features

### Format
The Format feature allows users to normalize USFM formatting across a book or the entire project. It uses a high-performance **Reduce/Pipe** architecture to transform Lexical's serialized state directly, ensuring consistency without the overhead of full editor instances.

- **Operations**: Whitespace collapse, linebreak normalization, and paragraph marker spacing.
- **Safety**: All operations are reversible via a "Revert All" option in the change review modal.

For more details on the structure and how to use it, see [SRC-CORE-STRUCTURE.md](./SRC-CORE-STRUCTURE.md).

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Testing

This project uses [Jest](https://jestjs.io/) for testing. The configuration is defined in `jest.config.ts` at the root of the project.

### Available Test Scripts

- `pnpm test` - Run all tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:coverage` - Run tests with coverage report

### Writing Tests

Tests are located in `__tests__` directories within both `src` and `src-core`. Test files should follow the naming convention `*.test.ts` or `*.test.tsx`.

Example:
```typescript
// src/__tests__/example.test.ts
describe('Example test', () => {
  it('should work', () => {
    expect(1 + 1).toBe(2);
  });
});
```

## Code Formatting and Linting

This project uses [Biome](https://biomejs.dev/) for code formatting and linting. The configuration is defined in `biome.json` at the root of the project.

### Available Scripts

- `pnpm format` - Format all files using Biome
- `pnpm lint` - Lint all files using Biome
- `pnpm check` - Run Biome check with auto-fixes
- `pnpm biome` - Comprehensive check that formats, lints, and organizes imports in one command

### Usage Examples

To format all files in the project:
```bash
pnpm format
```

To run the comprehensive check (recommended):
```bash
pnpm biome
```
