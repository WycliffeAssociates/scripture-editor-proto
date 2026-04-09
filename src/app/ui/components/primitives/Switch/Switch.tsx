import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import * as styles from "./switch.css.ts";

export interface SwitchProps
    extends Omit<ComponentPropsWithoutRef<typeof BaseSwitch.Root>, "children"> {
    label?: ReactNode;
    className?: string;
}

function joinClassNames(...classNames: Array<string | undefined>) {
    return classNames.filter(Boolean).join(" ");
}

export function Switch({
    checked,
    defaultChecked,
    onCheckedChange,
    disabled,
    readOnly,
    label,
    className,
    ...rootProps
}: SwitchProps) {
    return (
        <span className={joinClassNames(styles.root, className)}>
            <BaseSwitch.Root
                checked={checked}
                defaultChecked={defaultChecked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
                readOnly={readOnly}
                className={styles.track}
                {...rootProps}
            >
                <BaseSwitch.Thumb className={styles.thumb} />
            </BaseSwitch.Root>
            {label ? <span className={styles.label}>{label}</span> : null}
        </span>
    );
}
