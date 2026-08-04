import type { MirrorResult } from "./mirrorProtocol.ts";

/**
 * Every owned buffer in a result, for the worker's `postMessage` transfer list.
 *
 * A buffer left off this list is structured-cloned instead of moved, which for
 * a load means a second whole-corpus allocation on the main thread: the packed
 * container, every book's source bytes, and Galley's packed findings are the
 * three largest payloads the app moves, and all three cross here.
 *
 * Ownership follows the transfer. A host that still needs bytes after handing a
 * result over must copy them BEFORE returning it — see the sidecar write in
 * `webMirrorEngines.loadProject`, which snapshots the packed corpus for the
 * cache rather than retaining the buffer this detaches.
 */
export function transferablesOf(result: MirrorResult): Transferable[] {
  switch (result.kind) {
    case "galleyResult":
      return [result.packed];
    case "publishBraidResult":
      return result.publication ? [result.publication.packed] : [];
    case "loadProjectResult":
      return [result.packed, result.sources, result.galley?.packed].filter(
        (buffer): buffer is ArrayBuffer => buffer !== undefined,
      );
    default:
      return [];
  }
}

/**
 * What a result costs to cross a thread boundary, for the edit trace.
 *
 * Two very different things happen at that boundary: a transferred buffer
 * moves (a pointer hand-off, effectively free), while everything else is
 * structured-cloned — walked, copied, and rebuilt on the other side. A result
 * that reads as "one small packed buffer" can still be dominated by an
 * incidental object graph riding beside it, and the only way to see that is to
 * name both halves.
 */
export function describeResultPayload(result: MirrorResult): string {
  const transfer = transferablesOf(result)
    .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer)
    .map((buffer) => `u8:${buffer.byteLength}`)
    .join(",");
  const parts = [
    cloned(result) && `clone=${cloned(result)}`,
    transfer && `transfer=${transfer}`,
  ].filter(Boolean);
  return parts.join(" ") || "clone=small";
}

/** The object graph that is copied, not moved — described by what dominates it. */
function cloned(result: MirrorResult): string {
  switch (result.kind) {
    case "lintResult":
      return `findings:${result.snapshot.books.reduce(
        (total, book) => total + book.findings.length,
        0,
      )}`;
    case "galleyResult":
      return `keys:${result.keys.length},segments:${Object.keys(result.segments).length}`;
    case "loadProjectResult":
      return `books:${result.books?.length ?? 0}`;
    case "formatBraidResult":
    case "applyBraidFixResult":
      return `tokens:${Object.values(result.books).reduce(
        (total, tokens) => total + tokens.length,
        0,
      )}`;
    default:
      return "";
  }
}
