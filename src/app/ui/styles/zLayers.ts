// Single source of truth for app-level z-index stacking.
//
// Values are sequential integers starting at 1 — ordering is expressed by
// the names, not by gaps between numbers. Add a new layer by inserting a
// name in the right position and renumbering from that point down.
//
// Local stacking contexts (values inside DiffModal internals and ToggleGroup)
// are intentionally excluded — they live within isolated stacking contexts
// and never interact with this stack.

export const zLayer = {
    // --- DOM overlay hosts mounted as siblings to the editor ---
    lintDomOverlay: 1,
    formInsertMarkerMenu: 1,

    // --- Lightweight positioned overlays ---
    /** Search/replace suggest overlay host; project row dialog backdrop */
    floatingPanel: 3,

    // --- Generic floating UI ---
    popover: 4,

    // --- Sticky chrome + standard positioners ---
    /** Toast notifications, editor pane sticky header, BasePopover/LintIssues positioners */
    popoverPositioner: 5,

    /** Cloud status tooltip popup (CSS layer — sits above its positioner) */
    cloudTooltipPopup: 6,

    /** Cloud status Tooltip.Positioner (inline) */
    cloudTooltipPositioner: 7,

    // --- Fixed floating overlays ---
    /** Context menu, lint tooltip overlay */
    floatingOverlay: 8,

    // --- Editor workspace stacking system (layered panels) ---
    /** Workspace overlay pane (Projectview) and DiffModal overlay shell */
    editorOverlayPane: 9,

    /** Main editor contentEditable surface */
    editorContent: 10,

    /** Bottom reference/lint panel — slides above editor content */
    referencePanelBottom: 11,

    /** Editor switching status badge — just above reference panel */
    editorSwitchingOverlay: 12,

    /** Insert menu and lint-filter positioners — must clear reference panel and switching overlay */
    editorMenuPositioner: 13,

    // --- Global dropdowns ---
    selectDropdown: 14,

    /** Toolbar overflow menu — must clear everything */
    toolbarMenu: 15,

    /** Toolbar tooltip — sits above the toolbar menu */
    toolbarTooltip: 16,

    /** Modal dialogs (e.g. the chapter-label standardize picker) — clear all. */
    dialog: 20,
} as const;
