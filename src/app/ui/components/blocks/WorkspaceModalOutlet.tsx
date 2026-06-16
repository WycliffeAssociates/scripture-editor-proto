// WorkspaceModalOutlet.tsx
//
// The one workspace-level host for modals opened through
// `WorkspaceModalStore` (see that file for the rationale). Mounted once by
// the workspace provider; renders whatever component the store holds and
// injects `onClose`.

import { useSyncExternalStore } from "react";

import type { WorkspaceModalStore } from "@/app/state/WorkspaceModalStore.ts";

export function WorkspaceModalOutlet({
  store,
}: {
  store: WorkspaceModalStore;
}) {
  const entry = useSyncExternalStore(store.subscribe, store.getSnapshot);
  if (!entry) return null;
  return <entry.Component {...entry.props} onClose={store.close} />;
}
