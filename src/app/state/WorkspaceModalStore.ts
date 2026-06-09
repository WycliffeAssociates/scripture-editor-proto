// WorkspaceModalStore.ts
//
// Workspace-level modal outlet state: one `{ Component, props } | null` slot
// rendered by `WorkspaceModalOutlet` at the workspace layout level —
// emphatically OUTSIDE the Lexical tree (Lexical is one view over the data;
// workspace chrome hangs off the workspace). Callers hand the outlet a
// component directly — no string registry — so opening a modal is an ordinary
// typed function call from anywhere that holds the store (decorator actions
// today; command surfaces tomorrow).

import type { ComponentType } from "react";

type Listener = () => void;

/** Injected by the outlet so every hosted modal can dismiss itself. */
export type WorkspaceModalBaseProps = { onClose: () => void };

export type WorkspaceModalEntry = {
    Component: ComponentType<WorkspaceModalBaseProps>;
    props: Record<string, unknown>;
};

export class WorkspaceModalStore {
    private state: WorkspaceModalEntry | null = null;
    private readonly listeners = new Set<Listener>();

    getSnapshot = (): WorkspaceModalEntry | null => this.state;

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /**
     * Show `Component` in the outlet with `props` (+ the injected `onClose`).
     * One slot: opening replaces whatever was open.
     */
    open = <P extends object>(
        Component: ComponentType<P & WorkspaceModalBaseProps>,
        props: P,
    ): void => {
        // Erased at the boundary; the generic signature is the type safety.
        this.state = {
            Component: Component as ComponentType<WorkspaceModalBaseProps>,
            props: props as Record<string, unknown>,
        };
        this.notify();
    };

    close = (): void => {
        if (this.state === null) return;
        this.state = null;
        this.notify();
    };

    private notify(): void {
        for (const listener of this.listeners) listener();
    }
}
