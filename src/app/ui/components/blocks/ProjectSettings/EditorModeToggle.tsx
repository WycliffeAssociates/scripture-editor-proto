import { Trans } from "@lingui/react/macro";
import {
    Box,
    Center,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
} from "@mantine/core";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import styles from "./Settings.module.css";

/**
 * EditorModeToggle
 *
 * Single segmented control that collapses marker/view/mode settings into three presets:
 * - regular: WYSIWYG, markers hidden (never), immutable
 * - plain: source mode (fewer helpers)
 * - usfm: WYSIWYG, markers always visible, mutable
 *
 * This component mirrors the styling used by `DisplayThemeToggle` in Settings.
 */
function EditorModeToggle() {
    const { project, actions } = useWorkspaceContext();

    const value = project.appSettings.editorMode ?? "regular";

    const handleChange = (v: string) => {
        const nextMode = v as "regular" | "plain" | "usfm";
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
                        value: "regular",
                        label: (
                            <ModeLabel
                                value="regular"
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
                        value: "plain",
                        label: (
                            <ModeLabel
                                value="plain"
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
                        value: "usfm",
                        label: (
                            <ModeLabel
                                value="usfm"
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
    const current = project.appSettings.editorMode ?? "regular";
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
