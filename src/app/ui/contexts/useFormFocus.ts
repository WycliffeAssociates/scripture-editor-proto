import { use } from "react";

import { FormFocusContext } from "@/app/ui/contexts/_formFocusContext.ts";
import type { FormFocusContextValue } from "@/app/ui/contexts/FormFocusContext.tsx";

export function useFormFocus(): FormFocusContextValue {
  return use(FormFocusContext);
}
