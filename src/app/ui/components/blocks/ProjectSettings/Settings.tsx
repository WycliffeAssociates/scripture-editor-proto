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
import { LOCALES } from "@/app/data/settings.ts";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";
import EditorModeToggle from "./EditorModeToggle.tsx";
import FontSizeControl from "./FontSizeControl.tsx";
import styles from "./Settings.module.css";
import ZoomControl from "./ZoomControl.tsx";
export function SettingsPanel() {
  const { project } = useWorkspaceContext();

  const handleLangChange = async (locale: string | null) => {
    if (!locale) return;
    project.updateAppSettings({ appLanguage: locale });
    // Make sure Lingui messages are activated
    await loadLocale(locale);
  };

  return (
    <Stack gap="lg">
      <DisplayThemeToggle />
      <EditorModeToggle />
      <ZoomControl />
      <FontSizeControl />
      {/*<FontPicker />*/}
      <LanguageSelector
        value={project.appSettings.appLanguage}
        onChange={handleLangChange}
      />
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
                className={`flex gap-2 ${project.appSettings.colorScheme === "light" ? styles.chosenToggle : ""}`}
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
                className={`flex gap-2 ${project.appSettings.colorScheme === "dark" ? styles.chosenToggle : ""}`}
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

export function LanguageSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (locale: string | null) => Promise<void> | void;
}) {
  // No longer use workspace/project context here. Parent should pass `value` and `onChange`.
  // const { i18n } = useLingui(); // Hook to access Lingui's i18n object

  // internal handler: if parent provided an onChange, call it; otherwise just activate the locale
  const internalHandleLanguageChange = async (locale: string | null) => {
    if (!locale) return;

    if (onChange) {
      await onChange(locale);
    } else {
      // fallback: activate Lingui only
      await loadLocale(locale);
    }

    console.log(`Language changed to: ${locale}.`);
  };

  // always use the internal handler which knows how to call parent onChange if provided
  const handleLanguageChange = internalHandleLanguageChange;

  const data = Object.entries(LOCALES).map(([key, value]) => ({
    value: key,
    label: value.nativeName,
    direction: value.direction,
  }));
  return (
    <Stack gap="xs">
      <Text data-testid="language-selector-label" size="md" mb="2" fw={500}>
        <Trans>Interface Localization</Trans>
      </Text>
      <Select
        data-testid="language-selector"
        radius={"lg"}
        styles={{
          root: {
            border: "none",
          },
          input: {
            paddingBlock: "var(--mantine-spacing-lg)",
          },
        }}
        leftSection={<Languages style={{ width: rem(20), height: rem(20) }} />}
        leftSectionPointerEvents="none"
        classNames={{
          root: styles.root,
          input: styles.input,
          dropdown: styles.dropdown,
        }}
        value={value ?? null} // prefer passed value; no project-context fallback
        onChange={handleLanguageChange}
        data={data.map((item) => ({
          value: item.value,
          // msg defined even if default form lingui
          label: item.label.message ?? "",
          direction: item.direction,
        }))}
      />
    </Stack>
  );
}
