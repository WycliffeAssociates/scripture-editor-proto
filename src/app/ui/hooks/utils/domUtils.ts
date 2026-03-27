import { EDITOR_MODES, type EditorModeSetting } from "@/app/data/editor.ts";

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
        root.dataset.editorMode =
            editorMode === EDITOR_MODES.view
                ? EDITOR_MODES.regular
                : editorMode;
        root.dataset.editorReadOnly =
            editorMode === EDITOR_MODES.view ? "true" : "false";
    }

    if (editorMode === EDITOR_MODES.plain) {
        document.body.classList.add("source-mode");
    } else {
        document.body.classList.remove("source-mode");
    }

    const appRoot = document.body.firstElementChild;
    if (!appRoot) return;

    if (
        editorMode === EDITOR_MODES.regular ||
        editorMode === EDITOR_MODES.view
    ) {
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
