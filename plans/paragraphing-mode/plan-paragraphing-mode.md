# Plan: Paragraphing Mode

## Overview
Paragraphing Mode is a specialized editor workflow designed to help users quickly and accurately format unformatted scripture text by "stamping" structural markers (paragraphs, poetry, etc.) from a reference text.

Instead of manually typing markers, the user follows a "Ghost Marker" that tracks their caret. Pressing `Enter` "stamps" the next marker from the reference queue into the target text.

## User Experience
1. **Activation**: User toggles "Paragraphing Mode" from the editor toolbar.
2. **Initialization**: 
   - User is prompted: "Remove existing paragraph markers for a clean slate?"
   - The system extracts all structural markers from the current **Reference Pane** text into a sequential queue.
3. **The Ghost**: A light-grey "ghost" marker (e.g., `\p`) appears at the editor caret position.
4. **The Loop**:
   - **Move Caret**: User moves the cursor to where a marker should go.
   - **Stamp (`Enter`)**: Inserts the marker and advances the queue.
   - **Skip (`Tab`/`Right`)**: Skips the current marker in the queue.
   - **Back (`Left`)**: Reverts the last insertion and moves the queue back.
5. **Context**: A small tooltip above the ghost shows the reference verse context (e.g., `Ref: 8:1`).

## Technical Architecture

### 1. State Management (`ParagraphingProvider`)
A new React Context to track:
- `isActive`: Boolean.
- `queue`: Array of `{ marker: string, context: string, refSid: string }`.
- `currentIndex`: Pointer to the active marker.
- `history`: Stack of previous insertions for the "Back" action.

### 2. Queue Extraction
A utility to traverse the Reference Pane's Lexical state:
- Filter for `USFMTextNode` where `tokenType === 'marker'` and `marker` is in `VALID_PARA_MARKERS`.
- Associate each marker with the nearest preceding `sid` (verse ID) for UI context.

### 3. Ghost Marker Component
- A floating portal anchored to the caret.
- Uses `window.getSelection()` and `getBoundingClientRect()` to sync position.
- Renders a non-interactive, styled representation of the current marker.

### 4. Keyboard Interceptors
High-priority Lexical command listeners:
- `KEY_ENTER_COMMAND`: If mode is active, trigger `stampMarker`.
- `KEY_TAB_COMMAND` / `KEY_ARROW_RIGHT_COMMAND`: Trigger `skipMarker`.
- `KEY_ARROW_LEFT_COMMAND`: Trigger `undoMarker`.

### 5. Clean Slate Logic
A transformation function for `SerializedLexicalNode[]`:
- Removes all structural markers while preserving text nodes and verse anchors.
- Configurable via a "Markers to Strip" set.

## Success Criteria
- Users can format a chapter in significantly less time than manual typing.
- High precision: Markers land exactly where the user intends.
- Low friction: The "Ghost" provides immediate feedback on what is being inserted.
- Mobile-friendly: A "Stamp" button provides the same functionality as `Enter`.
