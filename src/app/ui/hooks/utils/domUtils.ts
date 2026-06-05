import {
    domPresentationMode,
    EDITOR_MODES,
    type EditorModeSetting,
    isEditableEditorMode,
    markersHiddenInMode,
} from "@/app/data/editor.ts";

/**
 * Mirror the current editor mode onto top-level DOM classes and attributes so the
 * rest of the app shell and CSS can react without each component re-deriving mode
 * state.
 */
export function updateDomForEditorMode({
    editorMode,
}: {
    editorMode: EditorModeSetting;
}) {
    const root = document.querySelector("#root") as HTMLElement | null;
    if (root) {
        // View mode should *look* like Regular mode (same CSS selectors),
        // but we keep an explicit read-only flag for targeted styling if needed.
        root.dataset.editorMode = domPresentationMode(editorMode);
        root.dataset.editorReadOnly = isEditableEditorMode(editorMode)
            ? "false"
            : "true";
    }

    if (editorMode === EDITOR_MODES.plain) {
        document.body.classList.add("source-mode");
    } else {
        document.body.classList.remove("source-mode");
    }

    const appRoot = document.body.firstElementChild;
    if (!appRoot) return;

    if (markersHiddenInMode(editorMode)) {
        appRoot.classList.add("markers-hidden");
        appRoot.classList.remove("markers-shown");
    } else {
        appRoot.classList.add("markers-shown");
        appRoot.classList.remove("markers-hidden");
    }
}
/**
 * Tiny development-only timing helper for synchronous UI experiments.
 */
/** @knipignore */
export function timeInDev(fn: () => void, label?: string) {
    if (import.meta.env.DEV) {
        const start = performance.now();
        const r = fn();
        const end = performance.now();
        console.log(`Label: ${label}, Time: ${end - start}ms`);
        return r;
    } else {
        return fn();
    }
}
// todo: should likely get rid if we can't change that it kills the stacktrace to always come from herer
export async function timeInDevAsync<T>(
    fn: () => Promise<T>,
    label?: string,
): Promise<T> {
    if (import.meta.env.DEV) {
        const start = performance.now();
        const result = await fn();
        const end = performance.now();
        console.log(`Label: ${label}, Time: ${end - start}ms`);
        return result;
    } else {
        return await fn();
    }
}
