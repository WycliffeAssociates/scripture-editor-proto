import { createContext } from "react";
import type { WorkSpaceContextType } from "@/app/ui/contexts/WorkspaceContext.tsx";

export const WorkspaceContext = createContext<WorkSpaceContextType | undefined>(
    undefined,
);
