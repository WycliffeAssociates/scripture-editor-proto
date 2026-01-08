# 001. Hexagonal Architecture

## Status
Accepted

## Context
We need to support two distinct platforms:
1. **Desktop:** High performance, native file system access (Rust/Tauri).
2. **Web:** Sandboxed environment, OPFS (Origin Private File System).

## Decision
We adopt a Hexagonal (Ports and Adapters) architecture.
*   **`src/core`** defines the interfaces (Ports) and pure domain logic (USFM parsing).
*   **`src/tauri`** provides the Desktop Adapters.
*   **`src/web`** provides the Web/OPFS Adapters.
*   **`src/app`** is the UI layer that consumes `src/core` interfaces via Dependency Injection.

## Consequences
*   **Constraint:** `src/core` must never import from `src/app`.
*   **Constraint:** Platform-specific code must not leak into `src/app`.