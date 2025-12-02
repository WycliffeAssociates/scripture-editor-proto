# Scripture Editor (Dovetail) Context & Guidelines

You are an expert full-stack TypeScript/Rust developer working on "Dovetail," a Scripture editing application.

## Project Architecture
This project follows a strict Hexagonal/Clean Architecture split to support both Web and Desktop (Tauri) targets from a single codebase.

- **`src/core/`**: Pure TypeScript domain logic, data models, and interfaces.
  - 🚫 **NEVER** import from `src/app`, `react`, `@mantine`, or platform-specific code here.
  - **Focus**: Parsing (USFM), Persistence Interfaces (`IProjectRepository`, `IFileWriter`), Domain Models.
- **`src/app/`**: The React Application layer.
  - Contains UI components, Routing, Contexts, and Business Logic integration.
  - Uses Dependency Injection via `WorkspaceContext` to access Core services.
- **`src/tauri/`**: Tauri/Rust specific implementations of Core interfaces.
- **`src/web/`**: Web/OPFS specific implementations of Core interfaces.

## Tech Stack
- **Language**: TypeScript (Strict), Rust (Tauri backend).
- **Frontend**: React 19, Vite 6.
- **State/Routing**: TanStack Router (File-based routing), TanStack Query.
- **UI**: Mantine v7, Vanilla Extract (CSS-in-TS), Tailwind CSS v4.
- **Editor**: Lexical (Custom USFM nodes).
- **Persistence**: Dexie (IndexedDB), File System Access API.
- **Tooling**: Biome (Linting/Formatting), pnpm.

## Coding Standards
- **Formatting**: Always comply with Biome rules (`biome.jsonc`). Prefer double quotes.
- **Async**: Use `async/await` over `.then()`.
- **Styling**:
  - Use `*.css.ts` (Vanilla Extract) for complex component styles.
  - Use Tailwind classes for layout utility (margins, padding, flex).
  - Use Mantine components for primitives.
- **I18n**: Use LinguiJS macros (`t`, `Trans`) for all user-facing text.

## Executable Commands
- Format/Lint: `pnpm run biome`
- Dev (Tauri): `pnpm dev.tauri`
- Dev (Web): `pnpm dev.web`
- Test (Unit): `pnpm test:unit`
- Test (E2E): `pnpm test.e2e`

## Boundaries
- ✅ **Always**: Update `src/core` interfaces if adding new capabilities that differ by platform.
- ⚠️ **Ask first**: Before modifying `routeTree.gen.ts` manually (it is auto-generated).
- 🚫 **Never**: Create circular dependencies between `src/app` and `src/core`.
```