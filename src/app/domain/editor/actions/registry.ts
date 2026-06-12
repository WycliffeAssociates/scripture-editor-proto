import { EDITOR_MODES } from "@/app/data/editor.ts";

import { MARKER_ACTIONS } from "./markerActions.ts";
import { MODE_ACTIONS } from "./modeActions.ts";
import { NAVIGATION_ACTIONS } from "./navigationActions.tsx";
import { PRETTIFY_ACTIONS } from "./prettifyActions.ts";
import { SEARCH_ACTIONS } from "./searchActions.ts";
import { THEME_ACTIONS } from "./themeActions.ts";
import type { EditorAction, EditorContext } from "./types.ts";

/**
 * Full action-palette registry.
 *
 * The palette composes multiple action families into one searchable command
 * surface rather than each UI feature owning its own bespoke launcher.
 */
const EDITOR_ACTIONS: EditorAction[] = [
  ...NAVIGATION_ACTIONS,
  ...SEARCH_ACTIONS,
  ...MARKER_ACTIONS,
  ...MODE_ACTIONS,
  ...THEME_ACTIONS,
  ...PRETTIFY_ACTIONS,
];

/**
 * Reorder visible actions for the current context.
 *
 * This exists because some contexts have a single highly likely intent. For
 * example, when the caret can promote a verse number, the "make verse marker"
 * action is disproportionately relevant and should surface first.
 */
function sortVisibleActions(
  visible: EditorAction[],
  context: EditorContext,
): EditorAction[] {
  if (!context.canMakeVerseMarkerFromCursor) return visible;

  const index = visible.findIndex(
    (action) => action.id === "make-verse-marker",
  );
  if (index <= 0) return visible;

  const [action] = visible.splice(index, 1);
  visible.unshift(action);
  return visible;
}

/**
 * Return the context-filtered action palette entries for the current editor
 * state.
 */
export function getVisibleActions(context: EditorContext): EditorAction[] {
  const visible = EDITOR_ACTIONS.filter((action) => {
    // Form mode owns marker insertion via its own `+` slots and
    // textarea right-click menu. The cursor-anchored "Insert
    // marker" / "Make verse marker" / "Change previous marker"
    // entries from the action palette would compete with that
    // and operate on a non-existent text-cursor surface.
    if (
      context.editorMode === EDITOR_MODES.form &&
      action.category === "Markers"
    ) {
      return false;
    }
    return action.isVisible(context);
  });
  return sortVisibleActions(visible, context);
}
