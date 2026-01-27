# Progress: Paragraphing Mode

## Status
- [x] Interview & Planning
- [x] Design Document Created
- [x] PRD Created
- [ ] Implementation (Pending)

## Decisions
- Use a "Ghost Marker" that follows the caret.
- Use `Enter` as the primary "Stamp" trigger.
- Use `Tab` to skip markers.
- Extract queue from the Reference Pane's current chapter.
- Provide a "Clean Slate" option to strip existing markers.

## Next Steps
1. Implement `ParagraphingContext` and `ParagraphingProvider`.
2. Implement extraction and stripping utilities.
3. Create the `ParagraphingGhost` component.
