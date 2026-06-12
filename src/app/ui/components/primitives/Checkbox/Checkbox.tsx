import { type InputHTMLAttributes, type Ref, useId } from "react";

import { joinClassNames } from "../classNames.ts";
import * as styles from "./checkbox.css.ts";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> {
  label?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Checkbox({
  label,
  className,
  id: propId,
  ref,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const id = propId ?? generatedId;

  return (
    <label htmlFor={id} className={styles.checkboxWrapper}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className={joinClassNames(styles.checkboxInput, className)}
        {...props}
      />
      <span className={styles.checkboxControl}>
        <svg
          className={styles.checkboxCheck}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <title>Checked</title>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      {label ? <span className={styles.checkboxLabel}>{label}</span> : null}
    </label>
  );
}
