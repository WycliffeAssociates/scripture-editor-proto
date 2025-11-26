import { Trans } from "@lingui/react/macro";
import { ActionIcon, Box, rem, Stack, Text, TextInput } from "@mantine/core";
import { Minus, Plus } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import styles from "./Settings.module.css";

/**
 * FontSizeControl
 *
 * Provides a small control very similar to ZoomControl but for editor font size.
 * - minus button to decrease by 1px
 * - editable center allowing typing (number, with or without "px")
 * - plus button to increase by 1px
 *
 * Reads/writes `project.appSettings.fontSize` (string like "16px") via project.updateAppSettings.
 *
 * Behavior:
 * - increments/decrements by 1px
 * - typing accepts either "16" or "16px" (or with whitespace)
 * - clamps between minPx and maxPx
 */
export default function FontSizeControl() {
  const { project } = useWorkspaceContext();
  const { theme, isDarkTheme } = useWorkspaceMediaQuery();

  const minPx = 10;
  const maxPx = 40;
  const step = 1;

  // parse current fontSize string ("16px") into a number
  const parseFontSize = useCallback((value: string | undefined): number => {
    if (!value) return 16;
    const cleaned = value.trim().replace("px", "");
    const parsed = parseInt(cleaned, 10);
    if (Number.isNaN(parsed)) return 16;
    return parsed;
  }, []);

  const currentFromSettings = parseFontSize(project.appSettings.fontSize);
  const [localPx, setLocalPx] = useState<number>(currentFromSettings);
  const [display, setDisplay] = useState<string>(`${currentFromSettings}px`);

  // keep local state in sync when settings change externally
  useEffect(() => {
    const parsed = parseFontSize(project.appSettings.fontSize);
    setLocalPx(parsed);
    setDisplay(`${parsed}px`);
  }, [project.appSettings.fontSize, parseFontSize]);

  const commitPx = useCallback(
    (px: number) => {
      const clamped = Math.max(minPx, Math.min(maxPx, Math.round(px)));
      setLocalPx(clamped);
      setDisplay(`${clamped}px`);
      project.updateAppSettings({ fontSize: `${clamped}px` });
    },
    [project],
  );

  const handleIncrement = () => commitPx(localPx + step);
  const handleDecrement = () => commitPx(localPx - step);

  const parseInputToPx = (raw: string) => {
    if (!raw) return null;
    const cleaned = raw.trim().replace("px", "");
    const parsed = parseInt(cleaned, 10);
    if (Number.isNaN(parsed)) return null;
    return parsed;
  };

  const handleInputBlur = () => {
    const parsed = parseInputToPx(display);
    if (parsed === null) {
      // reset to current valid value
      setDisplay(`${localPx}px`);
      return;
    }
    commitPx(parsed);
  };

  const handleInputKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (
    e,
  ) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      handleIncrement();
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      handleDecrement();
    }
  };

  return (
    <Stack gap="xs">
      <Text size="md" mb="2" fw={500}>
        <Trans>Text size</Trans>
      </Text>

      <Box
        style={{
          display: "flex",
          alignItems: "center",
          border: `1px solid var(--mantine-color-default-border)`,
          borderRadius: rem(12),
          overflow: "hidden",
          minWidth: rem(220),
          background: isDarkTheme ? theme.colors.dark[8] : theme.colors.gray[1],
        }}
      >
        <ActionIcon
          variant="subtle"
          onClick={handleDecrement}
          aria-label="Decrease font size"
          title="Decrease"
          style={{
            width: rem(56),
            height: rem(44),
            borderRight: `1px solid var(--mantine-color-default-border)`,
          }}
        >
          <Minus size="1.1rem" />
        </ActionIcon>

        <Box
          style={{
            flex: 1,
            borderLeft: isDarkTheme
              ? `1px solid ${theme.colors.dark[5]}`
              : `1px solid ${theme.colors.gray[3]}`,
            borderRight: isDarkTheme
              ? `1px solid ${theme.colors.dark[5]}`
              : `1px solid ${theme.colors.gray[3]}`,
          }}
        >
          <TextInput
            value={display}
            onChange={(e) => setDisplay(e.currentTarget.value)}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            variant="unstyled"
            classNames={{
              input: styles.centeredTextInput,
            }}
            aria-label="Font size in pixels"
          />
        </Box>

        <ActionIcon
          variant="subtle"
          onClick={handleIncrement}
          aria-label="Increase font size"
          title="Increase"
          style={{
            width: rem(56),
            height: rem(44),
          }}
        >
          <Plus size="1.1rem" />
        </ActionIcon>
      </Box>
    </Stack>
  );
}
