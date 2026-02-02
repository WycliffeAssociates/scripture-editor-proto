export function updateDomForEditorMode({
    editorMode,
}: {
    editorMode: "regular" | "usfm" | "plain";
}) {
    const root = document.querySelector("#root") as HTMLElement | null;
    if (root) {
        root.dataset.editorMode = editorMode;
    }

    if (editorMode === "plain") {
        document.body.classList.add("source-mode");
    } else {
        document.body.classList.remove("source-mode");
    }

    const appRoot = document.body.firstElementChild;
    if (!appRoot) return;

    if (editorMode === "regular") {
        appRoot.classList.add("markers-hidden");
        appRoot.classList.remove("markers-shown");
    } else {
        appRoot.classList.add("markers-shown");
        appRoot.classList.remove("markers-hidden");
    }
}
