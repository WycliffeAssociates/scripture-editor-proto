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

export function timeIt<T>(fn: () => T, name?: string) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`${name || "Function"} took ${end - start}ms`);
    return result;
}

export function everyArrayItemInEach<T>(a: Array<T>, b: Array<T>) {
    if (a.length !== b.length) return false;
    // if b holds extra items, size check will catch it
    return a.every((item) => b.includes(item));
}

export function arraysEqualByKey<T extends Record<string, unknown>>(
    a: T[],
    b: T[],
    key: keyof T,
): boolean {
    if (a.length !== b.length) return false;

    const aKeys = new Set(a.map((x) => x[key]));
    const bKeys = new Set(b.map((x) => x[key]));

    if (aKeys.size !== bKeys.size) return false;

    for (const val of aKeys) {
        if (!bKeys.has(val)) return false;
    }
    return true;
}
