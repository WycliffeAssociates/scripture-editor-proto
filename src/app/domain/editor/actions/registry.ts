import { MARKER_ACTIONS } from "./markerActions.ts";
import { MODE_ACTIONS } from "./modeActions.ts";
import { NAVIGATION_ACTIONS } from "./navigationActions.tsx";
import { PRETTIFY_ACTIONS } from "./prettifyActions.ts";
import { SEARCH_ACTIONS } from "./searchActions.ts";
import type { EditorAction, EditorContext } from "./types.ts";

const EDITOR_ACTIONS: EditorAction[] = [
    ...NAVIGATION_ACTIONS,
    ...SEARCH_ACTIONS,
    ...MARKER_ACTIONS,
    ...MODE_ACTIONS,
    ...PRETTIFY_ACTIONS,
];

export function getVisibleActions(context: EditorContext): EditorAction[] {
    return EDITOR_ACTIONS.filter((action) => action.isVisible(context));
}
