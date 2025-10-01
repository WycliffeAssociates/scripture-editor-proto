# Scripture Editor Core Structure

## Overview

This project has been restructured to separate core functionality from UI code. The structure is now:

- `src-core/`: Contains domain models, data structures, and utility functions
- `src/`: Contains UI components and client-specific code
- `src-tauri/`: Contains Tauri-specific code for desktop app

## Purpose

This separation allows for:

1. Better code organization with clear boundaries
2. Potential reuse of core functionality in different UI implementations (web, desktop)
3. Easier testing of core business logic
4. Cleaner dependency management

## Directory Structure

```
scripture-editor-proto/
├── src-core/           # Core library with domain and data code
│   ├── data/           # Data structures and models
│   ├── domain/         # Domain logic and business rules
│   ├── lib/            # Utility functions and helpers
│   ├── index.ts        # Main export file
│   └── package.json    # Package definition
├── src/                # Client UI code
│   ├── api/            # API integration
│   ├── ui/             # UI components
│   └── ...
└── src-tauri/          # Tauri desktop app code
```

## How to Import

In your client code, you can import from the core library using the `@core` path alias:

```typescript
// Import from core library
import { parseUSFM } from '@core/lib/parse';
import { ParsedFile } from '@core/data/parser/parsed';
```

## Development Guidelines

1. **Core Library (`src-core/`)**:
   - Should not contain UI components or framework-specific code
   - Should not have dependencies on UI libraries
   - Focus on pure business logic, data structures, and utilities

2. **Client Code (`src/`)**:
   - Contains UI components and application-specific logic
   - Imports and uses functionality from the core library
   - Can have dependencies on UI frameworks and libraries

## Building

The Vite configuration has been updated to recognize `src-core` as a library. When building the project, both `src` and `src-core` are included in the build process.

## Future Considerations

If needed, `src-core` could be extracted into a separate package for use in multiple projects or published as an npm package.