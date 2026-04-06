import { BookOpen, RefreshCw } from "lucide-react";
import { SelectPrimitive } from "@/app/ui/components/primitives/Select/Select.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/ReferencePicker.css.ts";

/**
 * Reference resource picker for the reference pane toolbar.
 *
 * Displays a dropdown of available reference resources (scripture, translation
 * notes, etc.) and allows switching the active reference for side-by-side
 * comparison with the main editable text.
 */
export function ReferencePicker() {
    const { referenceResource } = useWorkspaceContext();
    const {
        referenceResourcesQuery,
        activeReferenceResourcePath,
        setActiveReferenceResourcePath,
        activeReferenceResourceDisplayName,
    } = referenceResource;

    const availableResources = referenceResourcesQuery.data ?? [];
    const isLoading = referenceResourcesQuery.isLoading;

    const selectItems = availableResources.map((resource) => ({
        value: resource.projectPath,
        label: resource.displayName,
    }));

    const handleValueChange = (value: string | null) => {
        if (value) {
            setActiveReferenceResourcePath(value);
        }
    };

    return (
        <div className={styles.referencePicker}>
            <SelectPrimitive
                items={selectItems}
                value={activeReferenceResourcePath}
                placeholder={isLoading ? "Loading..." : "Select reference..."}
                onValueChange={handleValueChange}
                className={styles.referencePickerSelect}
            />
            {activeReferenceResourceDisplayName ? (
                <span className={styles.referencePickerInfo}>
                    <BookOpen size={14} />
                    {activeReferenceResourceDisplayName}
                </span>
            ) : null}
            {isLoading ? (
                <span className={styles.referencePickerInfo}>
                    <RefreshCw size={14} />
                    Loading
                </span>
            ) : null}
        </div>
    );
}
