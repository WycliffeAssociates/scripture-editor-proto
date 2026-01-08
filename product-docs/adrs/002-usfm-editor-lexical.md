# 002. Lexical for USFM Editing

## Status
Accepted

## Context
USFM (Unified Standard Format Markers) is a complex, marker-based format. Standard `contenteditable` or Markdown editors cannot handle the nesting and metadata requirements (e.g., preserving un-editable markers while editing text).

## Decision
We use **Lexical** as the editor engine.
*   We implement custom Nodes (`USFMElementNode`, `USFMTextNode`) to represent markers.
*   We use a custom Parser (`src/core/domain/usfm`) to transform USFM string <-> Lexical State.

## Consequences
*   **Complexity:** We own the serialization logic. It is critical to maintain 1:1 parity between the USFM string and the Editor State.
*   **Performance:** Large chapters require careful optimization of Lexical listeners.