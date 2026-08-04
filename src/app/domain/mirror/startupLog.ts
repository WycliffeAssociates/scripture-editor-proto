// startupLog.ts
//
// The trace of a project open — see `traceLog.ts` for the line format shared
// with the edit trace:
//
//   [startup] 01     +0ms open project=en_ulb preload=false
//   [startup] 02     +0ms (1740ms) main:open-project books=66
//   [startup] 03    ↳ +12ms (1269ms) main:open:project
//   [startup] 04  +2092ms (2134ms) main:host:load state=warm
//   [startup] 05    ↳ +2093ms (146ms) worker:braid:read-sources books=66
//
// Cache hits/misses and sidecar writes are phases like any other, so "warm or
// cold, and why" reads straight off the log without a profiler.
//
// The trace is single-threaded on purpose. A host that runs phases on the far
// side of a boundary — the web worker, the native Rust mirror — does not print:
// it records them and returns them with its result, and main replays them under
// the parent span with their offsets rebased onto this clock. One console, one
// sequence, real numbers throughout.
//
// Unlike the edit trace this is NOT gated on DEV: the point is that a nightly
// build's console shows how a real project opened on a real machine.

import {
  formatTraceFields,
  formatTraceLine,
  type TraceFields,
  type TracedPhase,
} from "./traceLog.ts";

let sequence = 0;
let openedAt: number | null = null;

/**
 * Begin a new open. Resets the sequence/elapsed origin so each project open
 * reads as its own block rather than accumulating across navigations.
 */
export function beginStartupTrace(fields: TraceFields): void {
  sequence = 0;
  openedAt = performance.now();
  emit("open", fields, { startedAt: 0 });
}

/** Elapsed since the open began, for a caller timing its own span. */
export function startupElapsed(): number {
  const now = performance.now();
  if (openedAt === null) openedAt = now;
  return now - openedAt;
}

/** Emit one phase line. `durationMs` is omitted only for instantaneous marks. */
export function logStartupPhase(
  phase: string,
  fields: TraceFields = {},
  span?: { startedAt: number; durationMs?: number },
  children?: readonly TracedPhase[],
): void {
  const resolved = span ?? { startedAt: startupElapsed() };
  emit(phase, fields, resolved);
  emitChildren(resolved.startedAt, children);
}

function emit(
  phase: string,
  fields: TraceFields,
  span: { startedAt: number; durationMs?: number; depth?: number },
): void {
  if (openedAt === null) openedAt = performance.now();
  console.info(
    formatTraceLine({
      prefix: `[startup] ${String(++sequence).padStart(2, "0")}`,
      startedAt: span.startedAt,
      durationMs: span.durationMs,
      depth: span.depth,
      phase,
      fields,
    }),
  );
}

function emitChildren(
  parentStartedAt: number,
  children: readonly TracedPhase[] | undefined,
): void {
  for (const child of children ?? []) {
    emit(child.phase, child.detail ?? {}, {
      startedAt: parentStartedAt + child.offsetMs,
      durationMs: child.durationMs,
      depth: child.depth ?? 1,
    });
  }
}

/**
 * A cache write that outlives the load it came from. It has no place in the
 * sequence — the trace has already ended by the time it lands — so it is
 * labelled rather than numbered.
 */
export function logCacheWrite(fields: TraceFields): void {
  console.info(`[startup:cache-write] ${formatTraceFields(fields)}`);
}

/**
 * Time `operation`, emit its line, and replay any phases recorded inside it as
 * children. Returns the value untouched.
 */
export async function timeStartupPhase<T>(
  phase: string,
  operation: () => Promise<T>,
  fields: (value: T) => TraceFields = () => ({}),
  children: (value: T) => readonly TracedPhase[] | undefined = () => undefined,
): Promise<T> {
  const startedAt = startupElapsed();
  const value = await operation();
  emit(phase, fields(value), {
    startedAt,
    durationMs: startupElapsed() - startedAt,
  });
  emitChildren(startedAt, children(value));
  return value;
}
