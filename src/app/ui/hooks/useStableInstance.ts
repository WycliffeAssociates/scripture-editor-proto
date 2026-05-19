import { useRef } from "react";

/**
 * Construct `T` once per component lifetime and reuse on every render. The
 * factory runs lazily on the first render and never again per surviving
 * mount, so callers can pass closures that reference render-time props
 * without re-allocating.
 *
 * StrictMode dev: React mounts → unmounts → remounts. The first mount's
 * instance is discarded on the synthetic unmount and the second mount runs
 * the factory again; the second instance is what survives. Keep factories
 * side-effect-free (or self-cleaning on unmount) — anything observable from
 * a discarded instance will appear to happen twice.
 */
export function useStableInstance<T>(factory: () => T): T {
    const ref = useRef<T | null>(null);
    if (ref.current === null) ref.current = factory();
    return ref.current;
}
