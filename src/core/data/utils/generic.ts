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
