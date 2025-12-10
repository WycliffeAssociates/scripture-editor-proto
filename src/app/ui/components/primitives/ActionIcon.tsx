import { ActionIcon } from "@mantine/core";

export const ActionIconSimple = ActionIcon.withProps({
    variant: "subtle",
    classNames: {
        icon: "text-(--mantine-color-text)",
        root: "data-[disabled]:bg-transparent! data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
    },
});
