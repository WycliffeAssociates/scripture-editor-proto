import type { ButtonHTMLAttributes, ReactNode } from "react";
import * as styles from "./button.css.ts";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode;
    variant?: keyof typeof styles.buttonVariants;
    size?: keyof typeof styles.buttonSizes;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
}

function joinClassNames(...classNames: Array<string | undefined>) {
    return classNames.filter(Boolean).join(" ");
}

export function Button({
    children,
    variant = "primary",
    size = "md",
    className,
    leftIcon,
    rightIcon,
    type = "button",
    ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            className={joinClassNames(
                styles.buttonBase,
                styles.buttonVariants[variant],
                styles.buttonSizes[size],
                className,
            )}
            {...props}
        >
            {leftIcon ? (
                <span className={styles.iconSlot}>{leftIcon}</span>
            ) : null}
            {children}
            {rightIcon ? (
                <span className={styles.iconSlot}>{rightIcon}</span>
            ) : null}
        </button>
    );
}
