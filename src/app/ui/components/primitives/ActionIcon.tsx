import { ActionIcon } from "@mantine/core";
import * as styles from "@/app/ui/styles/modules/ActionIconSimple.css.ts";

/**
 * Shared action-icon styling for toolbar- and utility-level buttons.
 *
 * This keeps small icon affordances visually consistent across editor, search,
 * history, diff, and reference surfaces.
 */
export const ActionIconSimple = ActionIcon.withProps({
    variant: "subtle",
    classNames: {
        root: styles.root,
        icon: styles.icon,
    },
});
