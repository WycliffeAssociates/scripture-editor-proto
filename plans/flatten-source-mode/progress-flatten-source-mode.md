# Progress: Flatten Source Mode Footnotes

- [x] Task 1: Refactor adjustSerializedLexicalNodes
- [x] Task 2: Update toggleToSourceMode
- [x] Task 3: Update adjustWysiwygMode

## Decisions
- Using `flatMap` in `adjustSerializedLexicalNodes` to allow returning multiple nodes (flattening).
- Using full serialization/re-parse loop for Source -> WYSIWYG transition to ensure structural integrity.
- Flattening element nodes (like paragraphs) ONLY when `flattenNested` is true to provide a truly flat stream for Source Mode while preserving structure in WYSIWYG.
- Fixed `parseUSFMChapter` to require `bookCode` to prevent errors on mode switch.
- Updated `buildSidContentMapForChapter` to correctly handle nested markers inside flattened footnotes (Source Mode), preventing diff leakage into verse text.

## Summary
The feature is implemented and robust. Source Mode provides a raw editing experience for footnotes, and the system seamlessly transitions back to WYSIWYG. The diff engine now correctly interprets flattened footnotes as distinct semantic blocks, eliminating false positives and content leakage in the diff view.
