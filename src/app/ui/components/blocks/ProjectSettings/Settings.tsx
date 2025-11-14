import { Trans } from "@lingui/react/macro";
import {
    Box,
    Center,
    rem,
    SegmentedControl,
    Select,
    Stack,
    Text,
    useMantineColorScheme,
} from "@mantine/core";
import { Languages, Moon, Sun } from "lucide-react";
import { LOCALES, SUPPORTED_LOCALES } from "@/app/data/settings.ts";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import styles from "./Settings.module.css";
export function SettingsPanel() {
    return (
        <Stack gap="lg">
            <DisplayThemeToggle />
            <LanguageSelector />
        </Stack>
    );
}

function DisplayThemeToggle() {
    const { project } = useWorkspaceContext();
    const { setColorScheme } = useMantineColorScheme();

    return (
        <Stack gap="xs">
            <Text size="md" mb="2" fw={500}>
                <Trans>Display</Trans>
            </Text>
            <SegmentedControl
                radius={"lg"}
                withItemsBorders={false}
                value={project.appSettings.colorScheme}
                classNames={{
                    root: styles.root,
                    label: styles.label,
                    indicator: styles.indicator,
                }}
                onChange={(value) => {
                    if (value === "light" || value === "dark") {
                        project.updateAppSettings({ colorScheme: value });
                        setColorScheme(value);
                    }
                }}
                data={[
                    {
                        value: "light",
                        label: (
                            <Center
                                className={`flex gap-2 ${project.appSettings.colorScheme === "light" ? "text-(--mantine-primary-color-filled) font-bold" : ""}`}
                            >
                                <Sun size="1.5rem" />
                                <Box>
                                    <Trans>Light</Trans>
                                </Box>
                            </Center>
                        ),
                    },
                    {
                        value: "dark",
                        label: (
                            <Center
                                className={`flex gap-2 ${project.appSettings.colorScheme === "dark" ? "text-(--mantine-primary-color-filled) font-bold" : ""}`}
                            >
                                <Moon size="1.5rem" />
                                <Box>
                                    <Trans>Dark</Trans>
                                </Box>
                            </Center>
                        ),
                    },
                ]}
            />
        </Stack>
    );
}

export function LanguageSelector() {
    const { project } = useWorkspaceContext();
    // const { i18n } = useLingui(); // Hook to access Lingui's i18n object

    const handleLanguageChange = async (locale: string | null) => {
        if (!locale) return;

        // 1. Update your application's settings state
        project.updateAppSettings({ appLanguage: locale });

        // 2. Activate the new locale for Lingui
        // This usually involves dynamically loading the message catalog
        // await dynamicActivate(locale);
        console.log(
            `Language changed to: ${locale}. You would activate Lingui here.`,
        );
    };
    const data = Object.entries(LOCALES).map(([key, value]) => ({
        value: key,
        label: value,
    }));

    return (
        <Stack gap="xs">
            <Text size="md" mb="2" fw={500}>
                <Trans>Interface Localization</Trans>
            </Text>
            <Select
                radius={"lg"}
                styles={{
                    root: {
                        border: "none",
                    },
                    input: {
                        paddingBlock: "var(--mantine-spacing-lg)",
                    },
                }}
                leftSection={
                    <Languages style={{ width: rem(20), height: rem(20) }} />
                }
                leftSectionPointerEvents="none"
                classNames={{
                    root: styles.root,
                    input: styles.input,
                    dropdown: styles.dropdown,
                }}
                value={project.appSettings.appLanguage} // Get value from context
                onChange={handleLanguageChange} // Use the handler to update state and i18n
                data={data}
            />
        </Stack>
    );
}
