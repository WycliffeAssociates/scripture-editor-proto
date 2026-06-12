import { use } from "react";

import { WorkspaceContext } from "@/app/ui/contexts/_workspaceContext.ts";

/**
 * Typed access point for the workspace shell context. Route/component code should
 * come through this hook instead of reaching for the raw React context directly.
 */
export const useWorkspaceContext = () => {
  const ctx = use(WorkspaceContext);
  if (!ctx)
    throw new Error("useWorkspaceContext must be inside WorkspaceProvider");
  return ctx;
};
