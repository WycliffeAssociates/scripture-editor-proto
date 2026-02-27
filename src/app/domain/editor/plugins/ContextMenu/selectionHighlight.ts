const CONTEXT_MENU_SELECTION_HIGHLIGHT_KEY = "context-menu-selection";

export function showContextMenuSelectionHighlight(range: Range): void {
    const highlight = new Highlight();
    highlight.add(range.cloneRange());
    CSS.highlights.set(CONTEXT_MENU_SELECTION_HIGHLIGHT_KEY, highlight);
}

export function clearContextMenuSelectionHighlight(): void {
    CSS.highlights.delete(CONTEXT_MENU_SELECTION_HIGHLIGHT_KEY);
}
