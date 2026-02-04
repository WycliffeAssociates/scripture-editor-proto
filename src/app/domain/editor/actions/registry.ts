import { MARKER_ACTIONS } from "./markerActions.ts";
import { MODE_ACTIONS } from "./modeActions.ts";
import { NAVIGATION_ACTIONS } from "./navigationActions.tsx";
import { PRETTIFY_ACTIONS } from "./prettifyActions.ts";
import { SEARCH_ACTIONS } from "./searchActions.ts";
import { THEME_ACTIONS } from "./themeActions.ts";
import type { EditorAction, EditorContext } from "./types.ts";

const EDITOR_ACTIONS: EditorAction[] = [
    ...NAVIGATION_ACTIONS,
    ...SEARCH_ACTIONS,
    ...MARKER_ACTIONS,
    ...MODE_ACTIONS,
    ...THEME_ACTIONS,
    ...PRETTIFY_ACTIONS,
];

function sortVisibleActions(
    visible: EditorAction[],
    context: EditorContext,
): EditorAction[] {
    //  1. If we're in regular mode and have a verse number selection, move the "make verse marker" action to the front since it's most likely

    if (!context.canMakeVerseMarkerFromCursor) return visible;

    const index = visible.findIndex(
        (action) => action.id === "make-verse-marker",
    );
    if (index <= 0) return visible;

    const [action] = visible.splice(index, 1);
    visible.unshift(action);
    return visible;
}

export function getVisibleActions(context: EditorContext): EditorAction[] {
    const visible = EDITOR_ACTIONS.filter((action) =>
        action.isVisible(context),
    );
    return sortVisibleActions(visible, context);
}
