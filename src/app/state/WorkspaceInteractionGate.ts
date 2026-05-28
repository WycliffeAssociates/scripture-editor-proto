// WorkspaceInteractionGate.ts
//
// One of two orthogonal crash-recovery safety surfaces (the other is
// RecoveredConflictTracker). The gate is the coarse one: while a save is in
// flight or the user has an undecided recovery banner up, ALL workspace mutation
// is blocked. Every mutation entry point checks `requireGateOpen` at fire time;
// buttons additionally render disabled.
//
// Held in a tiny observable store so the editor and mutation hooks read the
// SAME live value (via `useSyncExternalStore`) rather than a prop-drilled
// snapshot that could be stale by the time a deferred callback fires.

type Listener = () => void;

/**
 * `open`                      — normal editing allowed.
 * `saving`                    — a save is persisting bytes; block mutation so the
 *                               captured save snapshot can't be raced mid-write.
 * `recovery-decision-pending` — a restore banner is up and the user has not yet
 *                               chosen Keep/Discard; block everything until they do.
 */
export type WorkspaceInteractionGate =
    | { kind: "open" }
    | { kind: "saving" }
    | { kind: "recovery-decision-pending" };

export function requireGateOpen(gate: WorkspaceInteractionGate): boolean {
    return gate.kind === "open";
}

export class WorkspaceGateStore {
    private gate: WorkspaceInteractionGate;
    private readonly listeners = new Set<Listener>();

    constructor(initial: WorkspaceInteractionGate = { kind: "open" }) {
        this.gate = initial;
    }

    get(): WorkspaceInteractionGate {
        return this.gate;
    }

    isOpen(): boolean {
        return requireGateOpen(this.gate);
    }

    set(next: WorkspaceInteractionGate): void {
        if (next.kind === this.gate.kind) return;
        this.gate = next;
        for (const listener of this.listeners) listener();
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getSnapshot(): WorkspaceInteractionGate {
        return this.gate;
    }
}
