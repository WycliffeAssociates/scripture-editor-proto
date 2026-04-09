import { Select } from "@base-ui/react/select";
import { Check } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import * as styles from "./select.css.ts";

function joinClassNames(...classNames: Array<string | undefined>) {
    return classNames.filter(Boolean).join(" ");
}

export interface SelectItem {
    value: string;
    label: string;
}

export interface SelectProps {
    items: SelectItem[];
    value?: string;
    defaultValue?: string;
    placeholder?: string;
    icon?: ReactNode;
    className?: string;
    popupClassName?: string;
    listClassName?: string;
    disabled?: boolean;
    portalContainer?: RefObject<HTMLElement | null>;
    onValueChange?: (value: string | null) => void;
}

export function SelectPrimitive({
    items,
    value,
    defaultValue,
    placeholder,
    icon,
    className,
    popupClassName,
    listClassName,
    disabled,
    portalContainer,
    onValueChange,
}: SelectProps) {
    return (
        <Select.Root
            value={value}
            defaultValue={defaultValue}
            onValueChange={onValueChange}
            items={items}
        >
            <Select.Trigger
                className={joinClassNames(styles.trigger, className)}
                disabled={disabled}
            >
                {icon ? (
                    <span className={styles.triggerIcon}>{icon}</span>
                ) : null}
                <Select.Value
                    className={styles.triggerValue}
                    placeholder={placeholder}
                />
                <Select.Icon className={styles.triggerIconEnd}>
                    <ChevronIcon />
                </Select.Icon>
            </Select.Trigger>

            <Select.Portal container={portalContainer}>
                <Select.Positioner sideOffset={8} alignItemWithTrigger={false}>
                    <Select.Popup
                        className={joinClassNames(styles.popup, popupClassName)}
                    >
                        <Select.List
                            className={joinClassNames(
                                styles.list,
                                listClassName,
                            )}
                        >
                            {items.map((item) => (
                                <Select.Item
                                    key={item.value}
                                    value={item.value}
                                    className={styles.item}
                                >
                                    <Select.ItemIndicator
                                        className={styles.itemIndicatorLeading}
                                        keepMounted
                                    >
                                        <span className={styles.radioCircle}>
                                            <Check
                                                className={styles.radioCheck}
                                                strokeWidth={3}
                                            />
                                        </span>
                                    </Select.ItemIndicator>
                                    <Select.ItemText
                                        className={styles.itemText}
                                    >
                                        {item.label}
                                    </Select.ItemText>
                                </Select.Item>
                            ))}
                        </Select.List>
                    </Select.Popup>
                </Select.Positioner>
            </Select.Portal>
        </Select.Root>
    );
}

function ChevronIcon() {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M8 10L12 14L16 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
