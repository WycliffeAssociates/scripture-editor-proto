import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import type { CSSProperties, ReactNode } from "react";
import * as styles from "./toggleGroup.css.ts";

export interface ToggleGroupItem {
    value: string;
    label?: string;
    icon?: ReactNode;
    disabled?: boolean;
}

export interface ToggleGroupProps {
    value?: string;
    onValueChange?: (value: string) => void;
    items: ToggleGroupItem[];
    className?: string;
    itemClassName?: string;
}

function joinClassNames(...classNames: Array<string | undefined>) {
    return classNames.filter(Boolean).join(" ");
}

export function ToggleGroup({
    value,
    onValueChange,
    items,
    className,
    itemClassName,
}: ToggleGroupProps) {
    const handleChange = (values: string[]) => {
        if (values.length > 0) {
            onValueChange?.(values[0]);
        }
    };

    const controlledValue = value ? [value] : undefined;
    const selectedIndex = items.findIndex((item) => item.value === value);
    const inlineVars = {
        [styles.selectedIndexVar]: String(
            selectedIndex >= 0 ? selectedIndex : 0,
        ),
        [styles.itemCountVar]: String(items.length),
    } as CSSProperties;

    return (
        <BaseToggleGroup
            value={controlledValue}
            onValueChange={handleChange}
            className={joinClassNames(styles.root, className)}
            style={inlineVars}
        >
            {selectedIndex >= 0 ? (
                <div className={styles.indicator} aria-hidden="true" />
            ) : null}
            {items.map((item) => (
                <Toggle
                    key={item.value}
                    value={item.value}
                    disabled={item.disabled}
                    className={joinClassNames(styles.item, itemClassName)}
                >
                    {item.icon ? (
                        <span className={styles.itemIcon}>{item.icon}</span>
                    ) : null}
                    {item.label ? (
                        <span className={styles.itemLabel}>{item.label}</span>
                    ) : null}
                </Toggle>
            ))}
        </BaseToggleGroup>
    );
}
