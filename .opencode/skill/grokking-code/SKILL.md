---
name: Grok Code
description: Efficiently digest large codebase context using repomix. Use this to understand architecture, module boundaries, or read many files at once without burning tool calls.
license: MIT
metadata:
  tool: repomix
  type: context-loading
---

## What I Do
I provide strategies for using `repomix` to ingest large amounts of code into your context window efficiently. Instead of calling `read_file` 20 times (which wastes tokens on tool overhead), you call `repomix` once.

## When to Use Me
*   **Architect:** When mapping out existing patterns or "Prior Art" before writing a plan.
*   **Builder:** When you need to read an entire module to understand imports/exports.
*   **QA:** When you need to see the implementation and tests side-by-side.

## Strategies

## What I Do
I provide strategies for using `repomix` to ingest large amounts of code directly into your context window via `stdout`. This avoids creating temporary files and reduces tool-call overhead compared to running `read_file` multiple times.

## Strategies

### 1. The High-Level Map (Architecture Only)
Use this to see class signatures, exports, and structure *without* implementation details. Great for checking Hexagonal boundaries or interface compliance.

```bash
repomix --compress --style xml --stdout
```

2. The Module Deep Dive
Use this to read every line of code in a specific directory.

```bash
repomix src/core/domain --style xml --stdout
```

3. The Surgical Strike (Search + Read)
Use this when you don't know the exact file paths, but you know what you are looking for. Pipe fd, find, or rg directly into repomix.
Example: Find and read all "Editor" related TypeScript files:
```bash
fd "Editor" -e ts -e tsx | repomix --stdin --style xml --stdout
```
Example: Read files containing specific text (e.g., "USFM"):
```bash
rg -l "USFM" --type ts | repomix --stdin --style xml --stdout
```

### Useful Options
Mix and match these flags to optimize your context usage:
*   `--compress`: Highly Recommended for large contexts. Uses Tree-sitter to strip function bodies, leaving only signatures and structural scaffolding.
*   `--remove-comments`: Removes code comments to save tokens when you only care about logic.
*   `--output-show-line-numbers`: Adds line numbers to the output. Essential if you plan to reference specific lines in your Plan or Analysis.
*   `--style xml`: The most robust format for LLM parsing. (Default).

### Best Practices
*   Prefer `--stdout`: Always use `--stdout` to pipe content directly to your context. Do not create intermediate files (`-o`) unless the output is too large for a single turn.
*   Filter Noise: Use `--ignore "**/*.spec.ts"` if you are focusing on implementation and don't need test files.
*   Use the help option for full details on the cli.
