export const normalize = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
const splitPath = (p: string) => normalize(p).split("/").filter(Boolean);