import { useCallback, useRef } from "react";

export function useCallbackRef<T extends (...args: unknown[]) => unknown>(
    callback: T,
) {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    return useCallback(
        (...args: Parameters<T>) => callbackRef.current(...args),
        [],
    );
}
