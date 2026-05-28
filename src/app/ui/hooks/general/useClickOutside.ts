import { useEffect, useEffectEvent, useMemo, useRef } from "react";

type EventType = MouseEvent | TouchEvent;

const DEFAULT_EVENTS = ["mousedown", "touchstart"];

export function useClickOutside<T extends HTMLElement = HTMLElement>(
    callback: (event: EventType) => void,
    events?: string[] | null,
    nodes?: (HTMLElement | null)[],
) {
    const ref = useRef<T>(null);
    const eventsList = useMemo(() => events || DEFAULT_EVENTS, [events]);

    const listener = useEffectEvent((event: Event) => {
        const { target } = event ?? {};
        if (Array.isArray(nodes)) {
            const shouldIgnore =
                !document.body.contains(target as Node) &&
                (target as Element)?.tagName !== "HTML";
            const shouldTrigger = nodes.every(
                (node) => !!node && !event.composedPath().includes(node),
            );
            if (shouldTrigger && !shouldIgnore) {
                callback(event as EventType);
            }
        } else if (ref.current && !ref.current.contains(target as Node)) {
            callback(event as EventType);
        }
    });

    // biome-ignore lint/correctness/useExhaustiveDependencies: `listener` is a useEffectEvent binding with stable identity by contract; including it in deps would defeat the point.
    useEffect(() => {
        const handler = (event: Event) => listener(event);
        eventsList.forEach((fn) => {
            document.addEventListener(fn, handler);
        });

        return () => {
            eventsList.forEach((fn) => {
                document.removeEventListener(fn, handler);
            });
        };
    }, [eventsList]);

    return ref;
}
