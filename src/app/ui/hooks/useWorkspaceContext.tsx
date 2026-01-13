import { useContext } from "react";
import { WorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";

export const useWorkspaceContext = () => {
    const ctx = useContext(WorkspaceContext);
    if (!ctx)
        throw new Error("useWorkspaceContext must be inside WorkspaceProvider");
    return ctx;
};
