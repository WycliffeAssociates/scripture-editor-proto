// traceLog.ts
//
// The shared vocabulary behind the two console traces: `startupLog` (a project
// open) and `editTrace` (one commit's journey to findings). They exist so the
// console self-describes what work happened and what it cost, rather than
// leaving a pile of unrelated `console.time` labels to be reassembled by eye.
//
// One line per phase, the same shape in both:
//
//   [startup] 04  +1479ms (3066ms) main:host:load state=warm
//   [edit] gen 4    ↳ +99ms (345ms) worker:roundtrip
//
// `+N` is when the phase STARTED relative to its trace's origin, `(N)` is how
// long it took, and indentation is nesting. A line's start plus its duration is
// the next sibling's start, so the column reads as a timeline rather than a mix
// of "when it finished" and "how long it took" — and siblings sharing a start
// are visibly concurrent.

export type TraceFields = Record<string, string | number | boolean | undefined>;

/**
 * A phase measured somewhere that could not print it: the web worker, the
 * native mirror, or main-thread code running inside a span whose own line has
 * not been emitted yet (a parent must print before its children). Replayed into
 * a trace with its offset rebased onto that trace's clock.
 */
export type TracedPhase = {
  phase: string;
  /** Start, relative to the recorder that captured it. */
  offsetMs: number;
  /**
   * Absolute epoch ms, when the recorder can supply it. A phase recorded on
   * the far side of a boundary did not necessarily happen inside the call that
   * carried it home — patches are applied before the command that follows them
   * is even sent — so placing it relative to that call misreports when it ran.
   */
  startedAtEpochMs?: number;
  durationMs: number;
  detail?: TraceFields;
  /** Nesting below the parent the phase is replayed under. Defaults to 1. */
  depth?: number;
};

export function formatTraceFields(fields: TraceFields): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}

/**
 * One trace line. `depth` 0 is a top-level span, whose start is right-aligned so
 * the column scans; deeper phases are indented under their parent with `↳`.
 */
export function formatTraceLine(line: {
  prefix: string;
  startedAt: number;
  durationMs?: number;
  depth?: number;
  phase: string;
  fields?: TraceFields;
}): string {
  const depth = line.depth ?? 0;
  const started = `+${Math.round(line.startedAt)}ms`;
  const position =
    depth === 0 ? started.padStart(8) : `${"    ".repeat(depth)}↳ ${started}`;
  const took =
    line.durationMs === undefined ? "" : ` (${Math.round(line.durationMs)}ms)`;
  const detail = line.fields ? formatTraceFields(line.fields) : "";
  return `${line.prefix} ${position}${took} ${line.phase} ${detail}`.trimEnd();
}

/**
 * Collects phases for later replay, each stamped with its offset from the
 * recorder's creation.
 */
export type PhaseRecorder = {
  record(phase: string, detail?: TraceFields): void;
  time<T>(
    phase: string,
    operation: () => Promise<T>,
    detail?: (value: T) => TraceFields,
  ): Promise<T>;
  timeSync<T>(
    phase: string,
    operation: () => T,
    detail?: (value: T) => TraceFields,
  ): T;
  readonly phases: TracedPhase[];
};

export function createPhaseRecorder(): PhaseRecorder {
  const phases: TracedPhase[] = [];
  const createdAt = performance.now();
  const createdAtEpochMs = performance.timeOrigin + createdAt;
  const since = () => performance.now() - createdAt;
  const push = <T>(
    phase: string,
    offsetMs: number,
    value: T,
    detail?: (value: T) => TraceFields,
  ): T => {
    phases.push({
      phase,
      offsetMs,
      startedAtEpochMs: createdAtEpochMs + offsetMs,
      durationMs: since() - offsetMs,
      detail: detail?.(value),
    });
    return value;
  };
  return {
    phases,
    record(phase, detail) {
      const offsetMs = since();
      phases.push({
        phase,
        offsetMs,
        startedAtEpochMs: createdAtEpochMs + offsetMs,
        durationMs: 0,
        detail,
      });
    },
    async time(phase, operation, detail) {
      const offsetMs = since();
      return push(phase, offsetMs, await operation(), detail);
    },
    timeSync(phase, operation, detail) {
      const offsetMs = since();
      return push(phase, offsetMs, operation(), detail);
    },
  };
}
