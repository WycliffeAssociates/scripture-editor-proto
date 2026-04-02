import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import { useState } from "react";
import * as styles from "./tabs.css.ts";

function joinClassNames(...classNames: Array<string | undefined>) {
    return classNames.filter(Boolean).join(" ");
}

export interface TabItem {
    value: string;
    label: string;
    disabled?: boolean;
    icon?: ReactNode;
    content?: ReactNode;
}

export interface TabsProps {
    items: TabItem[];
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    orientation?: "horizontal" | "vertical";
    className?: string;
}

export function Tabs({
    items,
    value,
    defaultValue,
    onValueChange,
    orientation = "horizontal",
    className,
}: TabsProps) {
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = useState(
        defaultValue ?? items[0]?.value ?? "",
    );

    const handleValueChange = (newValue: string) => {
        if (!isControlled) {
            setInternalValue(newValue);
        }
        onValueChange?.(newValue);
    };

    const currentValue = isControlled ? value : internalValue;

    return (
        <BaseTabs.Root
            value={currentValue}
            onValueChange={handleValueChange}
            orientation={orientation}
            className={joinClassNames(styles.root, className)}
        >
            <BaseTabs.List className={styles.list}>
                {items.map((item) => (
                    <BaseTabs.Tab
                        key={item.value}
                        value={item.value}
                        disabled={item.disabled}
                        className={styles.tab}
                    >
                        <span className={styles.tabLabel}>{item.label}</span>
                    </BaseTabs.Tab>
                ))}
            </BaseTabs.List>
            {items.map((item) => (
                <BaseTabs.Panel
                    key={item.value}
                    value={item.value}
                    className={styles.panel}
                >
                    {item.content ?? item.label}
                </BaseTabs.Panel>
            ))}
        </BaseTabs.Root>
    );
}
