import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

import { joinClassNames } from "../classNames.ts";
import * as styles from "./button.css.ts";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: keyof typeof styles.buttonVariants;
  size?: keyof typeof styles.buttonSizes;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  leftIcon,
  rightIcon,
  type = "button",
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={joinClassNames(
        styles.buttonBase,
        styles.buttonVariants[variant],
        styles.buttonSizes[size],
        className,
      )}
      {...props}
    >
      {leftIcon ? <span className={styles.iconSlot}>{leftIcon}</span> : null}
      {children}
      {rightIcon ? <span className={styles.iconSlot}>{rightIcon}</span> : null}
    </button>
  );
}
