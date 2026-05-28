import { type Ref, type TextareaHTMLAttributes, useId } from "react";
import * as styles from "./textarea.css.ts";

function joinClassNames(...classNames: Array<string | undefined>) {
    return classNames.filter(Boolean).join(" ");
}

export interface TextareaProps
    extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    minRows?: number;
    autosize?: boolean;
    ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({
    label,
    error,
    minRows = 3,
    autosize = false,
    className,
    id: propId,
    style,
    ref,
    ...props
}: TextareaProps) {
    const generatedId = useId();
    const id = propId ?? generatedId;

    return (
        <div className={styles.textareaWrapper}>
            {label ? (
                <label htmlFor={id} className={styles.textareaLabel}>
                    {label}
                </label>
            ) : null}
            <textarea
                ref={ref}
                id={id}
                rows={minRows}
                className={joinClassNames(
                    styles.textarea,
                    autosize ? styles.textareaAutosize : undefined,
                    error ? styles.textareaError : undefined,
                    className,
                )}
                style={autosize ? { ...style, resize: "none" } : style}
                {...props}
            />
            {error ? (
                <span className={styles.textareaErrorText}>{error}</span>
            ) : null}
        </div>
    );
}
