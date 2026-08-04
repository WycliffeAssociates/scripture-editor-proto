// editTrace.ts
//
// One block per commit, from keystroke to findings on screen:
//
//   [edit] gen 4 userEdit chapters=1 dirtyText=true (465ms)
//   [edit] gen 4     ↳ +2ms (97ms) main:publish-patches patches=2
//   [edit] gen 4     ↳ +99ms (345ms) main:roundtrip
//   [edit] gen 4         ↳ +101ms (99ms) worker:braid:lint books=66
//   [edit] gen 4         ↳ +200ms (78ms) worker:galley:analyze verses=31102
//   [edit] gen 4     ↳ +444ms (22ms) main:findings braid=41 galley=12
//
// The point is that the console self-proclaims the work as well as the time:
// a phase says how many patches it published, how many books it linted, how
// many findings it committed. Reading the block should answer "what did that
// keystroke actually cost, and doing what?" without a profiler — and without
// trusting a description of the code over the code's own account of itself.
//
// The parts arrive out of order and across a thread boundary, correlated only
// by store generation, so a trace buffers until it goes quiet and then prints
// as one block. Interleaved lines were the problem this replaces.
//
// DEV only, and a no-op otherwise: this is per keystroke.

import {
  formatTraceFields,
  formatTraceLine,
  type TraceFields,
  type TracedPhase,
} from "./traceLog.ts";

/** Quiet period after the last phase before a trace prints. */
const FLUSH_AFTER_QUIET_MS = 250;
/** Hard cap, so a commit whose analysis never lands still reports. */
const FLUSH_DEADLINE_MS = 3_000;
/** Generations kept in flight; a stuck trace must not leak. */
const MAX_OPEN_TRACES = 8;

type OpenTrace = {
  generation: number;
  fields: TraceFields;
  startedAt: number;
  phases: TracedPhase[];
  quietTimer: ReturnType<typeof setTimeout> | null;
  deadlineTimer: ReturnType<typeof setTimeout>;
};

const open = new Map<number, OpenTrace>();
/** When a command left main, keyed `generation:kind`. */
const sentAt = new Map<string, number>();
/** When its result landed back on main, same key. */
const receivedAt = new Map<string, number>();
/** What the far side reported about crossing the boundary, by generation. */
const wireCost = new Map<number, WireReport>();

/** What the host can honestly report about a result, on its own clock. */
export type WireReport = {
  /** Total the host spent on this generation. */
  hostElapsedMs: number;
  shape: string;
};

const enabled = (): boolean => import.meta.env.DEV;

/**
 * Start a trace for a commit, or label one a phase already opened.
 *
 * Order-independent on purpose: phases and the commit header arrive from
 * separate subscribers to the same stream, and their relative order is not
 * guaranteed. Whichever lands first opens the trace; this one supplies the
 * header fields either way.
 */
export function beginEditTrace(
  generation: number,
  fields: TraceFields = {},
): void {
  if (!enabled()) return;
  const existing = open.get(generation);
  if (existing) {
    existing.fields = { ...fields, ...existing.fields };
    return;
  }
  openTrace(generation, fields);
}

function openTrace(generation: number, fields: TraceFields): OpenTrace {
  if (open.size >= MAX_OPEN_TRACES) {
    // Oldest first: whatever is still open is by definition stalled.
    const oldest = [...open.keys()].sort((a, b) => a - b)[0];
    if (oldest !== undefined) flushEditTrace(oldest);
  }
  const trace: OpenTrace = {
    generation,
    fields,
    startedAt: performance.now(),
    phases: [],
    quietTimer: null,
    deadlineTimer: setTimeout(
      () => flushEditTrace(generation),
      FLUSH_DEADLINE_MS,
    ),
  };
  open.set(generation, trace);
  armQuiet(trace);
  return trace;
}

/** Record a completed span against a generation's trace. */
function traceEditPhase(
  generation: number,
  phase: string,
  span: { startedAt: number; durationMs: number },
  fields?: TraceFields,
  children?: readonly TracedPhase[],
): void {
  if (!enabled()) return;
  const trace = open.get(generation) ?? openTrace(generation, {});
  const offsetMs = span.startedAt - trace.startedAt;
  trace.phases.push({
    phase,
    offsetMs,
    durationMs: span.durationMs,
    detail: fields,
    depth: 1,
  });
  // Anchored at this span's start, with the host's own internal offsets
  // preserved. The anchor is approximate — main cannot see when the host
  // picked the work up — but every number inside the block is a real delta
  // from one clock, and the unexplained remainder is reported as `gap`.
  for (const child of nestByContainment(children ?? [])) {
    trace.phases.push({
      ...child,
      offsetMs: offsetMs + child.offsetMs,
      depth: 1 + (child.depth ?? 1),
    });
  }
  armQuiet(trace);
}

/** Time `operation` into a generation's trace. Runs it either way. */
export function timeEditPhase<T>(
  generation: number,
  phase: string,
  operation: () => T,
  fields?: (value: T) => TraceFields,
): T {
  if (!enabled()) return operation();
  const startedAt = performance.now();
  const value = operation();
  traceEditPhase(
    generation,
    phase,
    { startedAt, durationMs: performance.now() - startedAt },
    fields?.(value),
  );
  return value;
}

/**
 * Note that a command left main for `generation`. Recorded at the feed rather
 * than in each pipeline: one place sees every command, on every platform.
 */
export function markEditCommand(generation: number, kind: string): void {
  if (!enabled() || !open.has(generation)) return;
  sentAt.set(`${generation}:${kind}`, performance.now());
}

/**
 * Note that a result landed back on main, BEFORE anything is done with it.
 * Splitting arrival from the commit that follows is the difference between
 * "the worker was slow" and "decoding and storing the result was slow" — the
 * two were indistinguishable while the round trip ran to the end of the router.
 */
export function markEditResult(generation: number, kind: string): void {
  if (!enabled() || !open.has(generation)) return;
  receivedAt.set(`${generation}:${kind}`, performance.now());
}

/**
 * Record what the host reported about the result that just arrived, so the
 * round trip can be broken into work, copy, and everything else.
 */
export function markEditWire(generation: number, report: WireReport): void {
  if (!enabled() || !open.has(generation)) return;
  wireCost.set(generation, report);
}

/**
 * Close out a command: the round trip it spent off main, whatever the host
 * measured inside that, and the main-thread work that consumed the result.
 */
export function traceEditCommandResult(
  generation: number,
  kind: string,
  fields?: TraceFields,
  children?: readonly TracedPhase[],
): void {
  if (!enabled()) return;
  const key = `${generation}:${kind}`;
  const startedAt = sentAt.get(key);
  if (startedAt === undefined) return;
  sentAt.delete(key);
  const landedAt = receivedAt.get(key) ?? performance.now();
  receivedAt.delete(key);
  const wire = wireCost.get(generation);
  wireCost.delete(generation);
  const roundtripMs = landedAt - startedAt;
  traceEditPhase(
    generation,
    `main:${kind}-roundtrip`,
    { startedAt, durationMs: roundtripMs },
    wire && {
      host: `${Math.round(wire.hostElapsedMs)}ms`,
      // What the host did not account for: queueing behind other work, the
      // structured clone, transport, and waiting on main's event loop to
      // deliver. Derived by subtraction, because no single clock spans it —
      // and a busy main thread inflates it as surely as a large payload does.
      gap: `${Math.max(0, Math.round(roundtripMs - wire.hostElapsedMs))}ms`,
      ...parseShape(wire.shape),
    },
    children,
  );
  traceEditPhase(
    generation,
    `main:${kind}-commit`,
    { startedAt: landedAt, durationMs: performance.now() - landedAt },
    fields,
  );
}

/**
 * A recorder's phases are a flat list, but some of them ran inside others.
 * Depth is derived from that containment rather than declared, so a host can
 * keep recording without knowing how its spans will be drawn.
 */
function nestByContainment(
  phases: readonly TracedPhase[],
): readonly TracedPhase[] {
  return phases.map((phase) => {
    const end = phase.offsetMs + phase.durationMs;
    const depth = phases.filter((other) => {
      if (other === phase) return false;
      const otherEnd = other.offsetMs + other.durationMs;
      const contains = other.offsetMs <= phase.offsetMs && otherEnd >= end;
      // Identical spans would otherwise nest inside each other, both ways.
      const identical = other.offsetMs === phase.offsetMs && otherEnd === end;
      return contains && (!identical || other.durationMs > phase.durationMs);
    }).length;
    return { ...phase, depth: 1 + depth };
  });
}

/** Print a trace now rather than waiting for it to go quiet. */
function flushEditTrace(generation: number): void {
  const trace = open.get(generation);
  if (!trace) return;
  open.delete(generation);
  if (trace.quietTimer) clearTimeout(trace.quietTimer);
  clearTimeout(trace.deadlineTimer);

  const prefix = `[edit] gen ${trace.generation}`;
  const total = trace.phases.reduce(
    (end, phase) => Math.max(end, phase.offsetMs + phase.durationMs),
    0,
  );
  // The header is the commit itself, not a phase — no start column, since a
  // trace's origin is always zero. A commit that did no downstream work is
  // therefore one line: "nothing happened" is worth being able to read too.
  const took = trace.phases.length === 0 ? "" : ` (${Math.round(total)}ms)`;
  console.info(`${prefix}${took} ${formatTraceFields(trace.fields)}`.trimEnd());
  for (const phase of trace.phases) {
    console.info(
      formatTraceLine({
        prefix,
        startedAt: phase.offsetMs,
        durationMs: phase.durationMs,
        depth: phase.depth ?? 1,
        phase: phase.phase,
        fields: phase.detail,
      }),
    );
  }
}

/** `clone=findings:14249 transfer=u8:992` → trace fields. */
function parseShape(shape: string): TraceFields {
  return Object.fromEntries(
    shape.split(" ").map((part) => {
      const [key, value] = part.split("=");
      return [key ?? "shape", value ?? ""];
    }),
  );
}

function armQuiet(trace: OpenTrace): void {
  if (trace.quietTimer) clearTimeout(trace.quietTimer);
  trace.quietTimer = setTimeout(
    () => flushEditTrace(trace.generation),
    FLUSH_AFTER_QUIET_MS,
  );
}
