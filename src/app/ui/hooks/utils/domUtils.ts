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
// Namespaces our dev measures so the logger (and a DevTools filter) can pick
// them out from framework/browser User Timing entries.
const DEV_TIMER_PREFIX = "⏱ ";

/**
 * Dev-only timing via the User Timing API. Use with `using` so disposal (the
 * measure) fires at scope exit without a wrapper frame:
 *
 *   using _t = devTimer("web:parseUsfm");
 *
 * The measure shows in DevTools → Performance → User Timing, and — once
 * {@link installDevTimerLogger} has run — is also logged to the console as it
 * completes. Either way there's no wrapper frame in the timed code's stack.
 * No-op in production.
 */
export function devTimer(label: string): Disposable {
    if (!import.meta.env.DEV) return { [Symbol.dispose]() {} };
    const start = performance.now();
    return {
        [Symbol.dispose]() {
            performance.measure(`${DEV_TIMER_PREFIX}${label}`, {
                start,
                end: performance.now(),
            });
        },
    };
}

let devTimerLoggerInstalled = false;

/**
 * Dev-only: console-log {@link devTimer} measures as they complete, so timings
 * are visible without opening DevTools → Performance. One `PerformanceObserver`
 * is the single console attribution point; each line is labeled by the measure
 * name. Idempotent; no-op in production or where `PerformanceObserver` is
 * unavailable. Call once at app startup.
 */
export function installDevTimerLogger(): void {
    if (!import.meta.env.DEV || devTimerLoggerInstalled) return;
    if (typeof PerformanceObserver === "undefined") return;
    devTimerLoggerInstalled = true;
    new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (
                entry.entryType === "measure" &&
                entry.name.startsWith(DEV_TIMER_PREFIX)
            ) {
                console.debug(`${entry.name}: ${entry.duration.toFixed(1)}ms`);
            }
        }
    }).observe({ entryTypes: ["measure"] });
}
