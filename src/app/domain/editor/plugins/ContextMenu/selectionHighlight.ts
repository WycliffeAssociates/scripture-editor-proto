const CONTEXT_MENU_SELECTION_HIGHLIGHT_KEY = "context-menu-selection";

/**
 * The native DOM selection becomes harder to perceive once the context menu opens.
 * Mirror the current range into a CSS Highlight so the command target remains
 * visible while the palette is on screen.
 */
export function showContextMenuSelectionHighlight(range: Range): void {
  const highlight = new Highlight();
  highlight.add(range.cloneRange());
  CSS.highlights.set(CONTEXT_MENU_SELECTION_HIGHLIGHT_KEY, highlight);
}

/**
 * Clears the transient selection highlight created for the context menu.
 */
export function clearContextMenuSelectionHighlight(): void {
  CSS.highlights.delete(CONTEXT_MENU_SELECTION_HIGHLIGHT_KEY);
}
