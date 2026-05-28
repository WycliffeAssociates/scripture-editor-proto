import { createContext } from "react";
import type { MediaQueryContextType } from "@/app/ui/contexts/MediaQuery.tsx";

export const MediaQueryContext = createContext<
    MediaQueryContextType | undefined
>(undefined);
