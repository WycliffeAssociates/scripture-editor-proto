export const normalize = (p: string) =>
  p.replace(/\\/g, "/").replace(/\/+$/, "");
export const splitPath = (p: string) => normalize(p).split("/").filter(Boolean);
