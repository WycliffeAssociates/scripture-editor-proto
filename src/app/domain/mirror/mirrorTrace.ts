// mirrorTrace.ts
//
// Diagnostic tracing across the mirror's async boundaries (commit → patch
// producer → pipeline command → feed → session → worker → mirror → result
// router). Off by default and zero-cost when off; flip on to see the ordered
// sequence of every hop with the generation each carries, which is the only way
// to read races on the unordered/awaited message chain.
//
// Enable on the main thread with `localStorage.mirrorTrace = "1"` (read once at
// load); the worker has no localStorage, so the main side forwards the flag in
// the worker init message and the worker relays its entries back over the
// channel to be logged here in sequence with the main-thread ones.

export type MirrorTraceEntry = {
  /** Monotonic per-thread; lets the two threads' lines be interleaved by eye. */
  seq: number;
  /** ms since trace start, for spotting debounce/await gaps. */
  t: number;
  boundary: string;
  data?: Record<string, unknown>;
};

function readInitialFlag(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("mirrorTrace") === "1"
    );
  } catch {
    // localStorage can throw in sandboxed/3rd-party contexts; treat as off.
    return false;
  }
}

let enabled = readInitialFlag();
let seq = 0;
const start = typeof performance !== "undefined" ? performance.now() : 0;

export function isMirrorTraceEnabled(): boolean {
  return enabled;
}

function now(): number {
  return (typeof performance !== "undefined" ? performance.now() : 0) - start;
}

/** Record a boundary crossing on THIS thread. */
export function mirrorTrace(
  boundary: string,
  data?: Record<string, unknown>,
): void {
  if (!enabled) return;
  const entry: MirrorTraceEntry = {
    seq: seq++,
    t: Math.round(now()),
    boundary,
    data,
  };
  log("·", entry);
}

/** Build a worker-side entry to ship back to the main thread for logging. */
export function makeMirrorTraceEntry(
  boundary: string,
  data?: Record<string, unknown>,
): MirrorTraceEntry {
  return { seq: seq++, t: Math.round(now()), boundary, data };
}

/** Log an entry that originated in a worker (relayed over the channel). */
export function logRelayedMirrorTrace(entry: MirrorTraceEntry): void {
  if (!enabled) return;
  log("WK", entry);
}

function log(origin: string, entry: MirrorTraceEntry): void {
  console.debug(
    `[mtrace ${origin} ${String(entry.seq).padStart(4, "0")} +${entry.t}ms] ${entry.boundary}`,
    entry.data ?? "",
  );
}
