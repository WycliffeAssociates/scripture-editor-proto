export type WorkspaceCommandBlockReason =
    | "gate-closed"
    | "recovered-review-required";

export type IncomingMutationAbortReason =
    | "empty-plan"
    | "stale-workspace"
    | "stale-chapter"
    | "gate-closed";

export type IncomingMutationResult<T = void> =
    | { kind: "committed"; computed: T }
    | { kind: "aborted"; reason: IncomingMutationAbortReason; computed?: T };

export type IncomingMutationRunResult<T> =
    | { kind: "committed"; computed: T }
    | { kind: "aborted"; reason: IncomingMutationAbortReason; computed: T };

export function incomingMutationAborted<T>(args: {
    reason: IncomingMutationAbortReason;
    computed?: T;
}): IncomingMutationResult<T> {
    return "computed" in args
        ? { kind: "aborted", reason: args.reason, computed: args.computed }
        : { kind: "aborted", reason: args.reason };
}
