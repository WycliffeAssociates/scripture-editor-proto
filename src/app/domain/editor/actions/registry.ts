import { MARKER_ACTIONS } from "./markerActions.ts";
import { MODE_ACTIONS } from "./modeActions.ts";
import { SEARCH_ACTIONS } from "./searchActions.ts";
import type { EditorAction, EditorContext } from "./types.ts";

export const EDITOR_ACTIONS: EditorAction[] = [
    ...SEARCH_ACTIONS,
    ...MARKER_ACTIONS,
    ...MODE_ACTIONS,
];

export function getVisibleActions(context: EditorContext): EditorAction[] {
    return EDITOR_ACTIONS.filter((action) => action.isVisible(context));
}
