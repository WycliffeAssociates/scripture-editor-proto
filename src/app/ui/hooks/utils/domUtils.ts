import {
    type EditorMarkersMutableState,
    EditorMarkersViewStates,
} from "@/app/data/editor.ts";

export function updateDomClassListWithMarkerViewState({
    viewState,
    mutableState,
    isSourceMode,
}: {
    viewState: EditorMarkersViewStates;
    mutableState: EditorMarkersMutableState;
    isSourceMode: boolean;
}) {
    if (isSourceMode) {
        document.body.classList.add("source-mode");
    } else {
        document.body.classList.remove("source-mode");
        const root = document.querySelector("#root") as HTMLElement | null;
        if (root) {
            root.dataset.markerViewState = viewState;
            root.dataset.markersMutableState = mutableState;
        }

        const body = document.body;
        const appRoot = body.firstElementChild;

        if (appRoot) {
            if (
                viewState === EditorMarkersViewStates.NEVER ||
                viewState === EditorMarkersViewStates.WHEN_EDITING
            ) {
                appRoot.classList.add("markers-hidden");
                appRoot.classList.remove("markers-shown");
            } else {
                appRoot.classList.remove("markers-hidden");
                appRoot.classList.add("markers-shown");
            }
        }
    }
}
