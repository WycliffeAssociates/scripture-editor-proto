export function updateDomForEditorMode({
    editorMode,
}: {
    editorMode: "regular" | "usfm" | "plain" | "view";
}) {
    const root = document.querySelector("#root") as HTMLElement | null;
    if (root) {
        // View mode should *look* like Regular mode (same CSS selectors),
        // but we keep an explicit read-only flag for targeted styling if needed.
        root.dataset.editorMode =
            editorMode === "view" ? "regular" : editorMode;
        root.dataset.editorReadOnly = editorMode === "view" ? "true" : "false";
    }

    if (editorMode === "plain") {
        document.body.classList.add("source-mode");
    } else {
        document.body.classList.remove("source-mode");
    }

    const appRoot = document.body.firstElementChild;
    if (!appRoot) return;

    if (editorMode === "regular" || editorMode === "view") {
        appRoot.classList.add("markers-hidden");
        appRoot.classList.remove("markers-shown");
    } else {
        appRoot.classList.add("markers-shown");
        appRoot.classList.remove("markers-hidden");
    }
}
