import { createContext } from "react";
import type { FormFocusContextValue } from "@/app/ui/contexts/FormFocusContext.tsx";

export const FormFocusContext = createContext<FormFocusContextValue>({
    focused: null,
    setFocused: () => {},
});
