import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { joinClassNames } from "../classNames.ts";
import * as styles from "./actionIcon.css.ts";

export interface ActionIconSimpleProps
    extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode;
    variant?: "subtle" | "filled";
    ref?: Ref<HTMLButtonElement>;
}

/**
 * Shared action-icon styling for toolbar- and utility-level buttons.
 *
 * This keeps small icon affordances visually consistent across editor, search,
 * history, diff, and reference surfaces.
 */
export function ActionIconSimple({
    children,
    className,
    variant = "subtle",
    ref,
    ...props
}: ActionIconSimpleProps) {
    return (
        <button
            ref={ref}
            type="button"
            className={joinClassNames(
                styles.root,
                variant === "filled" ? styles.filled : styles.subtle,
                className,
            )}
            {...props}
        >
            <span className={styles.icon}>{children}</span>
        </button>
    );
}
