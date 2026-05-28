import { Combobox } from "@base-ui/react/combobox";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { useLingui } from "@lingui/react/macro";
import { BookOpen, Check, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/ReferencePicker.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

type ReferenceItem = {
    value: string;
    label: string;
};

/**
 * Reference resource picker for the reference pane toolbar.
 *
 * Displays a searchable combobox of available reference resources (scripture,
 * translation notes, etc.) and allows switching the active reference for
 * side-by-side comparison with the main editable text.
 */
export function ReferencePicker() {
    const { t } = useLingui();
    const { referenceResource } = useWorkspaceContext();
    const {
        referenceResourcesQuery,
        activeReferenceResourcePath,
        setActiveReferenceResourcePath,
        activeReferenceResourceDisplayName,
    } = referenceResource;

    const availableResources = useMemo(
        () => referenceResourcesQuery.data ?? [],
        [referenceResourcesQuery.data],
    );
    const isLoading = referenceResourcesQuery.isLoading;

    const items: ReferenceItem[] = useMemo(
        () =>
            availableResources.map((resource) => ({
                value: resource.projectPath,
                label: resource.displayName,
            })),
        [availableResources],
    );

    const [inputValue, setInputValue] = useState("");

    const filteredItems = useMemo(() => {
        const q = inputValue.trim().toLowerCase();
        if (!q) return items;
        return items.filter((item) => item.label.toLowerCase().includes(q));
    }, [items, inputValue]);

    const selectedItem =
        items.find((item) => item.value === activeReferenceResourcePath) ??
        null;

    const triggerLabel = isLoading
        ? t`Loading...`
        : (selectedItem?.label ?? t`Select reference...`);

    return (
        <div className={styles.referencePicker}>
            <Combobox.Root<ReferenceItem>
                items={filteredItems}
                value={selectedItem}
                inputValue={inputValue}
                onInputValueChange={setInputValue}
                onValueChange={(value) => {
                    if (value) setActiveReferenceResourcePath(value.value);
                }}
                itemToStringLabel={(item) => item.label}
                itemToStringValue={(item) => item.value}
            >
                <Combobox.Trigger
                    className={styles.comboboxTrigger}
                    aria-label={t`Select reference resource`}
                >
                    <span className={styles.comboboxValue}>{triggerLabel}</span>
                    <span className={styles.comboboxChevron} aria-hidden="true">
                        ⌄
                    </span>
                </Combobox.Trigger>
                <Combobox.Portal>
                    <Combobox.Positioner
                        sideOffset={8}
                        align="start"
                        style={{ zIndex: zLayer.selectDropdown }}
                    >
                        <Combobox.Popup className={styles.comboboxPopup}>
                            <div className={styles.comboboxHeader}>
                                <Combobox.Input
                                    className={styles.comboboxInput}
                                    aria-label={t`Search reference resources`}
                                    placeholder={t`Search references`}
                                    autoFocus
                                />
                            </div>
                            <ScrollArea.Root
                                className={styles.comboboxScrollArea}
                            >
                                <ScrollArea.Viewport
                                    className={styles.comboboxScrollViewport}
                                >
                                    <Combobox.List
                                        className={styles.comboboxList}
                                    >
                                        {filteredItems.map((item) => (
                                            <Combobox.Item
                                                key={item.value}
                                                value={item}
                                                className={styles.comboboxItem}
                                            >
                                                <span
                                                    className={
                                                        styles.comboboxItemIndicator
                                                    }
                                                    aria-hidden="true"
                                                >
                                                    {selectedItem?.value ===
                                                    item.value ? (
                                                        <Check size={14} />
                                                    ) : null}
                                                </span>
                                                <span>{item.label}</span>
                                            </Combobox.Item>
                                        ))}
                                    </Combobox.List>
                                    <Combobox.Empty
                                        className={styles.comboboxEmpty}
                                    >
                                        {t`No references found.`}
                                    </Combobox.Empty>
                                </ScrollArea.Viewport>
                                <ScrollArea.Scrollbar orientation="vertical">
                                    <ScrollArea.Thumb />
                                </ScrollArea.Scrollbar>
                            </ScrollArea.Root>
                        </Combobox.Popup>
                    </Combobox.Positioner>
                </Combobox.Portal>
            </Combobox.Root>
            {activeReferenceResourceDisplayName ? (
                <span className={styles.referencePickerInfo}>
                    <BookOpen size={14} />
                    {activeReferenceResourceDisplayName}
                </span>
            ) : null}
            {isLoading ? (
                <span className={styles.referencePickerInfo}>
                    <RefreshCw size={14} />
                    {t`Loading`}
                </span>
            ) : null}
        </div>
    );
}
