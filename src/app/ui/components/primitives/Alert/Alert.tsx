import type { ReactNode } from "react";
import * as styles from "./alert.css.ts";

export type AlertColor = "red" | "green" | "yellow" | "blue";

export interface AlertProps {
    children: ReactNode;
    color?: AlertColor;
    icon?: ReactNode;
    title?: string;
    className?: string;
}

export function Alert({
    children,
    color = "blue",
    icon,
    title,
    className,
}: AlertProps) {
    return (
        <div
            className={`${styles.alert} ${styles.alertVariants[color]} ${className || ""}`}
            role="alert"
        >
            {icon ? <span className={styles.alertIcon}>{icon}</span> : null}
            <div className={styles.alertContent}>
                {title ? (
                    <span className={styles.alertTitle}>{title}</span>
                ) : null}
                {children}
            </div>
        </div>
    );
}
