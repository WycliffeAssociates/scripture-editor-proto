import type { ReactNode } from "react";
import * as styles from "./kbd.css.ts";

export interface KbdProps {
    keys?: string | string[];
    children?: ReactNode;
    className?: string;
}

const keyMap: Record<string, string> = {
    command: "⌘",
    cmd: "⌘",
    ctrl: "⌃",
    control: "⌃",
    shift: "⇧",
    option: "⌥",
    alt: "⌥",
    enter: "↵",
    delete: "⌫",
    backspace: "⌫",
    escape: "Esc",
    tab: "⇥",
    space: "␣",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
};

function joinClassNames(...classNames: Array<string | undefined>) {
    return classNames.filter(Boolean).join(" ");
}

export function Kbd({ keys, children, className }: KbdProps) {
    const keysArray = Array.isArray(keys)
        ? keys
        : typeof keys === "string"
          ? [keys]
          : [];

    return (
        <div className={joinClassNames(styles.container, className)}>
            {keysArray.map((key, index) => {
                const displayKey = keyMap[key.toLowerCase()] || key;
                return (
                    <kbd key={`${index}-${displayKey}`} className={styles.key}>
                        {displayKey}
                    </kbd>
                );
            })}
            {children && !keys ? (
                <kbd className={styles.key}>{children}</kbd>
            ) : null}
        </div>
    );
}
