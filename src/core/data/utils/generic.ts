// faster and lighterweight than crypto.randomUUID(), and any dependency, but still suffienct just for likley unique enough ids. Not as lightweight as a simple counter, but more random.
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
 * Repeatedly calls `fn` once per animation frame until:
 *   - it returns a truthy value (success), or
 *   - the timeout window expires.
 *
 * Returns a Promise that resolves with the truthy result or `null` on timeout.
 */
export function rafUntilSuccessOrTimeout<T>(
    fn: () => T | false | null | undefined,
    maxTimeout = 5000,
): Promise<T | null> {
    return new Promise((resolve) => {
        const start = performance.now();

        function tick() {
            console.count("rafUntilSuccessOrTimeout");
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
