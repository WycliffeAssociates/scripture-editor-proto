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
