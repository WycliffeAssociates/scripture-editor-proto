import { ActionIcon } from "@mantine/core";
import * as styles from "@/app/ui/styles/modules/ActionIconSimple.css.ts";

export const ActionIconSimple = ActionIcon.withProps({
    variant: "subtle",
    classNames: {
        root: styles.root,
        icon: styles.icon,
    },
});
