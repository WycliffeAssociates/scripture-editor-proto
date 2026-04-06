import { forwardRef, type InputHTMLAttributes, useId } from "react";
import * as styles from "./input.css.ts";

function joinClassNames(...classNames: Array<string | undefined>) {
    return classNames.filter(Boolean).join(" ");
}

export interface TextInputProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
    label?: string;
    error?: string;
    size?: "sm" | "md" | "lg";
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
    function TextInput(
        { label, error, size = "md", className, id: propId, ...props },
        ref,
    ) {
        const generatedId = useId();
        const id = propId ?? generatedId;

        return (
            <div className={styles.inputWrapper}>
                {label ? (
                    <label htmlFor={id} className={styles.inputLabel}>
                        {label}
                    </label>
                ) : null}
                <input
                    ref={ref}
                    id={id}
                    className={joinClassNames(
                        styles.input,
                        styles.inputSizes[size],
                        error ? styles.inputError : undefined,
                        className,
                    )}
                    {...props}
                />
                {error ? (
                    <span className={styles.inputErrorText}>{error}</span>
                ) : null}
            </div>
        );
    },
);
