import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Filter } from "lucide-react";
import {
    type FindingsFilterOption,
    isOptionChecked,
} from "@/app/ui/components/blocks/findingsFilters.utils.ts";
import * as buttonStyles from "@/app/ui/components/primitives/Button/button.css.ts";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";

export function FindingsFilterMenu(props: {
    label: string;
    options: FindingsFilterOption[];
    activeValues: string[];
    summary: string;
    onToggle: (value: string) => void;
}) {
    const triggerClassName = [
        buttonStyles.buttonBase,
        buttonStyles.buttonVariants.secondary,
        buttonStyles.buttonSizes.xs,
        styles.lintFilterTrigger,
    ].join(" ");

    return (
        <Menu.Root>
            <Menu.Trigger className={triggerClassName}>
                <span className={styles.lintFilterTriggerLabel}>
                    <Filter size={14} />
                    {props.label}
                </span>
                <span className={styles.lintFilterTriggerValue}>
                    {props.summary}
                </span>
                <ChevronDown size={14} />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner
                    side="bottom"
                    align="start"
                    sideOffset={4}
                    alignOffset={0}
                    className={styles.lintFilterMenuPositioner}
                >
                    <Menu.Popup className={styles.lintFilterMenuPopup}>
                        <div className={styles.lintFilterMenuList}>
                            {props.options.map((option) => {
                                const checked = isOptionChecked(
                                    option,
                                    props.activeValues,
                                    props.options,
                                );
                                return (
                                    <Menu.CheckboxItem
                                        key={option.value}
                                        className={styles.lintFilterMenuItem}
                                        checked={checked}
                                        onCheckedChange={() =>
                                            props.onToggle(option.value)
                                        }
                                    >
                                        <span
                                            className={
                                                styles.lintFilterMenuIndicator
                                            }
                                            aria-hidden="true"
                                        >
                                            {checked ? (
                                                <Check size={14} />
                                            ) : null}
                                        </span>
                                        <span>{option.label}</span>
                                    </Menu.CheckboxItem>
                                );
                            })}
                        </div>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
