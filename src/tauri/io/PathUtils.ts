/**
 * Normalize Tauri/desktop paths into the forward-slash form the shared storage
 * layer uses in app code and tests.
 */
export const normalize = (p: string) =>
    p.replace(/\\/g, "/").replace(/\/+$/, "");
// const splitPath = (p: string) => normalize(p).split("/").filter(Boolean);
