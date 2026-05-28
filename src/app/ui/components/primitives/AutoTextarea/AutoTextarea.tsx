import {
    type Ref,
    type TextareaHTMLAttributes,
    useLayoutEffect,
    useRef,
} from "react";

type AutoTextareaProps = Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "rows"
> & {
    /**
     * Minimum height in pixels. The textarea never grows below this even when
     * empty.
     */
    minHeightPx?: number;
    ref?: Ref<HTMLTextAreaElement>;
};

/**
 * Textarea that grows to fit its content so there is no internal scrollbar.
 *
 * Form-mode and other long-form structured surfaces use this so a verse with
 * one short line and a verse with a paragraph of running text both render
 * cleanly without an awkward inner scroll.
 */
export function AutoTextarea({
    value,
    minHeightPx = 36,
    onInput,
    ref: forwardedRef,
    ...rest
}: AutoTextareaProps) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    const setRefs = (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") {
            forwardedRef(node);
        } else if (forwardedRef) {
            forwardedRef.current = node;
        }
    };

    const resize = () => {
        const el = innerRef.current;
        if (!el) return;
        el.style.height = "auto";
        const next = Math.max(minHeightPx, el.scrollHeight);
        el.style.height = `${next}px`;
    };

    // Resize after every render. Textarea height is derived from DOM layout,
    // not from a stable React dependency list.
    useLayoutEffect(resize);

    return (
        <textarea
            {...rest}
            ref={setRefs}
            value={value}
            onInput={(event) => {
                resize();
                onInput?.(event);
            }}
            rows={1}
            style={{
                ...rest.style,
                minHeight: `${minHeightPx}px`,
                overflow: "hidden",
                resize: "none",
            }}
        />
    );
}
