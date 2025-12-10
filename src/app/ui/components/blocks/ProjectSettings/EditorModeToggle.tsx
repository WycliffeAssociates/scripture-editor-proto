import { Trans } from "@lingui/react/macro";
import {
  Box,
  Center,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  EditorMarkersMutableStates,
  EditorMarkersViewStates,
  EditorModes,
} from "@/app/data/editor.ts";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import styles from "./Settings.module.css";

/**
 * EditorModeToggle
 *
 * Single segmented control that collapses marker/view/mode settings into three presets:
 * - regular: WYSIWYG, markers hidden (never), immutable
 * - raw: source mode (raw)
 * - usfm: WYSIWYG, markers always visible, mutable
 *
 * This component mirrors the styling used by `DisplayThemeToggle` in Settings.
 */
export function EditorModeToggle() {
  const { project, actions } = useWorkspaceContext();

  const { mode, markersViewState, markersMutableState } = project.appSettings;

  const determineValue = () => {
    if (mode === EditorModes.SOURCE) return "raw";
    // mode is wysiwyg
    if (
      markersViewState === EditorMarkersViewStates.ALWAYS &&
      markersMutableState === EditorMarkersMutableStates.MUTABLE
    ) {
      return "usfm";
    }
    // default to regular for other wysiwyg combinations (hidden/immutable, whenEditing, etc.)
    return "regular";
  };

  const value = determineValue();

  const handleChange = (v: string) => {
    switch (v) {
      case "raw":
        // switch to source mode preset (uses existing action that also updates settings & DOM)
        if (actions.toggleToSourceMode) {
          actions.toggleToSourceMode();
        } else {
          // fallback: directly update settings to source with typical source presets
          project.updateAppSettings({
            mode: EditorModes.SOURCE,
            markersMutableState: EditorMarkersMutableStates.MUTABLE,
            markersViewState: EditorMarkersViewStates.ALWAYS,
          });
        }
        break;
      case "usfm":
        if (actions.adjustWysiwygMode) {
          actions.adjustWysiwygMode({
            markersViewState: EditorMarkersViewStates.ALWAYS,
            markersMutableState: EditorMarkersMutableStates.MUTABLE,
          });
        } else {
          project.updateAppSettings({
            mode: EditorModes.WYSIWYG,
            markersViewState: EditorMarkersViewStates.ALWAYS,
            markersMutableState: EditorMarkersMutableStates.MUTABLE,
          });
        }
        break;
      case "regular":
        if (actions.adjustWysiwygMode) {
          actions.adjustWysiwygMode({
            markersViewState: EditorMarkersViewStates.NEVER,
            markersMutableState: EditorMarkersMutableStates.IMMUTABLE,
          });
        } else {
          project.updateAppSettings({
            mode: EditorModes.WYSIWYG,
            markersViewState: EditorMarkersViewStates.NEVER,
            markersMutableState: EditorMarkersMutableStates.IMMUTABLE,
          });
        }
        break;
    }
  };

  return (
    <Stack gap="xs">
      <Text size="md" mb="2" fw={500}>
        <Trans>Editor Mode</Trans>
      </Text>
      <SegmentedControl
        radius={"lg"}
        withItemsBorders={false}
        value={value}
        classNames={{
          root: styles.root,
          label: styles.label,
          indicator: styles.indicator,
        }}
        onChange={handleChange}
        data={[
          {
            value: "regular",
            label: (
              <ModeLabel
                value="regular"
                tooltip={
                  <Trans>
                    Normal — shows only the bible text and verse numbers.
                  </Trans>
                }
                labelText={<Trans>Regular</Trans>}
              />
            ),
          },
          {
            value: "raw",
            label: (
              <ModeLabel
                value="raw"
                tooltip={
                  <Trans>
                    Raw — shows the underlying markup; no editor helpers.
                  </Trans>
                }
                labelText={<Trans>Raw</Trans>}
              />
            ),
          },
          {
            value: "usfm",
            label: (
              <ModeLabel
                value="usfm"
                tooltip={
                  <Trans>
                    USFM — shows special metadata (such as chapter and verse
                    markers) and allows editing it.
                  </Trans>
                }
                labelText={<Trans>USFM</Trans>}
              />
            ),
          },
        ]}
      />
    </Stack>
  );
}

export default EditorModeToggle;

const ModeLabel = ({
  value,
  tooltip,
  labelText,
}: {
  value: string;
  tooltip: React.ReactNode;
  labelText: React.ReactNode;
}) => {
  const { project } = useWorkspaceContext();
  const { mode, markersViewState, markersMutableState } = project.appSettings;

  const determineValue = () => {
    if (mode === EditorModes.SOURCE) return "raw";
    if (
      markersViewState === EditorMarkersViewStates.ALWAYS &&
      markersMutableState === EditorMarkersMutableStates.MUTABLE
    ) {
      return "usfm";
    }
    return "regular";
  };

  const current = determineValue();
  const isActive = value === current;

  return (
    <Tooltip label={tooltip} position="top" withArrow>
      <Center
        className={`flex gap-2 ${isActive ? "text-(--mantine-primary-color-filled) font-bold" : ""}`}
      >
        <Box>{labelText}</Box>
      </Center>
    </Tooltip>
  );
};
