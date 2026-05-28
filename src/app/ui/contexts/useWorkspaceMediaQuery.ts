import { use } from "react";
import { MediaQueryContext } from "@/app/ui/contexts/_mediaQueryContext.ts";
import type { MediaQueryContextType } from "@/app/ui/contexts/MediaQuery.tsx";

export function useWorkspaceMediaQuery(): MediaQueryContextType {
    const context = use(MediaQueryContext);
    if (context === undefined) {
        throw new Error(
            "useWorkspaceMediaQuery must be used within a MediaQueryProvider",
        );
    }
    return context;
}
