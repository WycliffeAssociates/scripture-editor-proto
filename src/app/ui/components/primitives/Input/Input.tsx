import { type InputHTMLAttributes, type Ref, useId } from "react";

import { joinClassNames } from "../classNames.ts";
import * as styles from "./input.css.ts";

export interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  label?: string;
  error?: string;
  size?: "sm" | "md" | "lg";
  ref?: Ref<HTMLInputElement>;
}

export function TextInput({
  label,
  error,
  size = "md",
  className,
  id: propId,
  ref,
  ...props
}: TextInputProps) {
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
      {error ? <span className={styles.inputErrorText}>{error}</span> : null}
    </div>
  );
}
