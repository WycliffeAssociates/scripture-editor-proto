import { Trans } from "@lingui/react/macro";
import { rem, Select, Stack, Text } from "@mantine/core";
import React, { useEffect, useState } from "react";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import styles from "./Settings.module.css";

/**
 * FontPicker
 *
 * Renders a Select for choosing the editor font family. This component only
 * renders when the user has access to system fonts (`appSettings.canAccessSystemFonts`).
 *
 * Behavior:
 * - Attempts to populate with system fonts (placeholder hook included as a comment).
 * - Always includes a safe default ("Inter") so the select is never empty.
 * - Updates `project.updateAppSettings({ fontFamily })` when changed.
 *
 * Note: system font enumeration depends on the host (desktop) environment. The
 * example code to fetch system fonts is left commented out because it depends on
 * native bindings (Tauri/Electron) which are environment-specific.
 */
export default function FontPicker() {
  const { project } = useWorkspaceContext();
  const { appSettings, updateAppSettings } = project;

  const [fonts, setFonts] = useState<string[]>(["Inter"]);

  // Example: load system fonts from a native bridge (Tauri/Electron).
  // Keep this commented here — enable in the runtime that exposes the bridge.
  //
  // useEffect(() => {
  //   // Example (Tauri): invoke<string[]>("get_system_fonts")
  //   //   .then((sysFonts) => {
  //   //     setFonts(["Inter", ...Array.from(new Set(sysFonts))]);
  //   //   })
  //   //   .catch(() => {});
  // }, []);

  // If the user cannot access system fonts, don't render this control.
  if (!appSettings.canAccessSystemFonts) return null;

  const data = fonts.map((f) => ({ value: f, label: f }));

  return (
    <Stack gap="xs">
      <Text size="md" mb="2" fw={500}>
        <Trans>Font</Trans>
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
        classNames={{
          root: styles.root,
          input: styles.input,
          dropdown: styles.dropdown,
        }}
        value={appSettings.fontFamily}
        onChange={(value) => {
          if (!value) return;
          updateAppSettings({ fontFamily: value });
        }}
        data={data}
        placeholder="Font"
        searchable
        // width similar to toolbar usage
        w={160}
      />
    </Stack>
  );
}
