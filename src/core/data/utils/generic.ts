/**
 * Small cross-cutting utilities used throughout the app.
 */

/**
 * Lightweight ID generator for editor/runtime identifiers.
 *
 * These IDs do not need the guarantees of a cryptographic UUID; they mostly need
 * to be unique enough for in-memory editor nodes and temporary UI bookkeeping.
 */
export function guidGenerator() {
    var S4 = () =>
        (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    return (
        S4() +
        S4() +
        "-" +
        S4() +
        "-" +
        S4() +
        "-" +
        S4() +
        "-" +
        S4() +
        S4() +
        S4()
    );
}

export const removeLeadingDirSlashes = (relPath: string): string => {
    if (relPath.startsWith("/")) {
        return relPath.substring(1);
    } else if (relPath.startsWith("./")) {
        return relPath.substring(2);
    }
    return relPath;
};

/**
 * Retry a DOM-dependent lookup across animation frames until it appears or a
 * timeout expires.
 *
 * This is mainly useful in editor/UI code that needs to wait for the DOM to
 * catch up with state changes without blocking the main thread.
 */
export function rafUntilSuccessOrTimeout<T>(
    fn: () => T | false | null | undefined,
    maxTimeout = 5000,
): Promise<T | null> {
    return new Promise((resolve) => {
        const start = performance.now();

        function tick() {
            const result = fn();
            if (result) {
                resolve(result);
                return;
            }
            if (performance.now() - start >= maxTimeout) {
                resolve(null);
                return;
            }
            requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    });
}
