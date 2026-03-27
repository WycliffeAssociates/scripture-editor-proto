import { Trans } from "@lingui/react/macro";
import {
    Box,
    Center,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
} from "@mantine/core";
import { EDITOR_MODES, type EditorModeSetting } from "@/app/data/editor.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import styles from "./Settings.module.css";

/**
 * Editor-mode selector for the current scripture workspace.
 *
 * The workspace already knows how to apply each mode. This component simply
 * exposes those mode presets in settings so the user can switch between
 * scripture-reading, plain-source, and full-USFM editing views.
 */
function EditorModeToggle() {
    const { project, actions } = useWorkspaceContext();

    const value = project.appSettings.editorMode ?? EDITOR_MODES.regular;

    const handleChange = (v: string) => {
        const nextMode = v as EditorModeSetting;
        if (actions.setEditorMode) {
            actions.setEditorMode(nextMode);
            return;
        }
        project.updateAppSettings({
            editorMode: nextMode,
        });
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
                        value: EDITOR_MODES.regular,
                        label: (
                            <ModeLabel
                                value={EDITOR_MODES.regular}
                                tooltip={
                                    <Trans>
                                        Normal — shows only the bible text and
                                        verse numbers.
                                    </Trans>
                                }
                                labelText={<Trans>Regular</Trans>}
                            />
                        ),
                    },
                    {
                        value: EDITOR_MODES.view,
                        label: (
                            <ModeLabel
                                value={EDITOR_MODES.view}
                                tooltip={
                                    <Trans>
                                        View — read-only, regular layout with
                                        markers hidden.
                                    </Trans>
                                }
                                labelText={<Trans>View</Trans>}
                            />
                        ),
                    },
                    {
                        value: EDITOR_MODES.plain,
                        label: (
                            <ModeLabel
                                value={EDITOR_MODES.plain}
                                tooltip={
                                    <Trans>
                                        Plain — shows the underlying markup;
                                        fewer editor helpers.
                                    </Trans>
                                }
                                labelText={<Trans>Plain</Trans>}
                            />
                        ),
                    },
                    {
                        value: EDITOR_MODES.usfm,
                        label: (
                            <ModeLabel
                                value={EDITOR_MODES.usfm}
                                tooltip={
                                    <Trans>
                                        USFM — shows special metadata (such as
                                        chapter and verse markers) and allows
                                        editing it.
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
    const current = project.appSettings.editorMode ?? EDITOR_MODES.regular;
    const isActive = value === current;

    return (
        <Tooltip label={tooltip} position="top" withArrow>
            <Center
                style={{
                    gap: "0.5rem",
                    color: isActive
                        ? "var(--mantine-primary-color-filled)"
                        : undefined,
                    fontWeight: isActive ? 700 : undefined,
                }}
            >
                <Box>{labelText}</Box>
            </Center>
        </Tooltip>
    );
};
