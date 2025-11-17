import { ActionIcon } from "@mantine/core";

export const ActionIconSimple = ActionIcon.withProps({
    variant: "subtle",
    classNames: {
        icon: "text-(--mantine-color-text)",
    },
});
