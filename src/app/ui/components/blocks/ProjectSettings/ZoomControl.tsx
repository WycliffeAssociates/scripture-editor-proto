import { Trans } from "@lingui/react/macro";
import { ActionIcon, Input, rem, Stack, Text, TextInput } from "@mantine/core";
import { Minus, Plus, ZoomIn } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";

/**
 * ZoomControl
 *
 * Small primitive that allows adjusting the editor zoom:
 * - minus button to decrease
 * - editable center showing percent (typing allowed)
 * - plus button to increase
 *
 * It reads/writes `project.appSettings.zoom` (a number like 1 === 100%)
 * via `project.updateAppSettings`.
 *
 * Behavior:
 * - increments/decrements by 5% (0.05)
 * - typing accepts a number or percent (e.g. "120" or "120%")
 * - value is clamped between 50% and 300% by default (0.5 - 3.0)
 */
export default function ZoomControl() {
    const { project } = useWorkspaceContext();
    const min = 0.5;
    const max = 3.0;
    const step = 0.05;

    const zoomFromSettings = project.appSettings.zoom ?? 1;
    const [display, setDisplay] = useState<string>(
        `${Math.round(zoomFromSettings * 100)}%`,
    );
    const [localZoom, setLocalZoom] = useState<number>(zoomFromSettings);

    // keep local state in sync when settings change externally
    useEffect(() => {
        setLocalZoom(zoomFromSettings);
        setDisplay(`${Math.round(zoomFromSettings * 100)}%`);
    }, [zoomFromSettings]);

    const commitZoom = (z: number) => {
        const clamped = Math.max(min, Math.min(max, z));
        setLocalZoom(clamped);
        setDisplay(`${Math.round(clamped * 100)}%`);
        project.updateAppSettings({ zoom: clamped });
    };

    const handleIncrement = () => {
        commitZoom(Number((localZoom + step).toFixed(3)));
    };
    const handleDecrement = () => {
        commitZoom(Number((localZoom - step).toFixed(3)));
    };

    const parseInputToZoom = (raw: string) => {
        if (!raw) return null;
        const cleaned = raw.trim().replace("%", "");
        const parsed = parseFloat(cleaned);
        if (Number.isNaN(parsed)) return null;
        return parsed / 100;
    };

    const handleInputBlur = () => {
        const parsed = parseInputToZoom(display);
        if (parsed === null) {
            // reset to current real value
            setDisplay(`${Math.round(localZoom * 100)}%`);
            return;
        }
        commitZoom(parsed);
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
    if (!project.appSettings.canSetZoom) {
        return null;
    }
    return (
        <Stack gap="xs">
            <Text size="md" mb="2" fw={500}>
                <Trans>Zoom</Trans>
            </Text>

            <div style={{ display: "flex", alignItems: "center" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        border: `1px solid var(--mantine-color-default-border)`,
                        borderRadius: rem(12),
                        overflow: "hidden",
                        background: "var(--mantine-color-filled)", // keeps subtle background
                        minWidth: rem(240),
                    }}
                >
                    <ActionIcon
                        variant="subtle"
                        onClick={handleDecrement}
                        aria-label="Decrease zoom"
                        title="Decrease"
                        style={{
                            width: rem(60),
                            height: rem(48),
                            borderRight: `1px solid var(--mantine-color-default-border)`,
                        }}
                    >
                        <Minus size="1.2rem" />
                    </ActionIcon>

                    <div
                        style={{
                            flex: 1,
                            minHeight: rem(48),
                            paddingInline: `var(--mantine-spacing-sm)`,
                            borderRight: `1px solid var(--mantine-color-default-border)`,
                            gap: rem(8),
                            display: "flex",
                            alignItems: "center",
                        }}
                    >
                        <ZoomIn size={rem(18)} />
                        <TextInput
                            value={display}
                            onChange={(e) => setDisplay(e.currentTarget.value)}
                            onBlur={handleInputBlur}
                            onKeyDown={handleInputKeyDown}
                            variant="unstyled"
                            style={{
                                width: rem(80),
                                textAlign: "center",
                                fontWeight: 600,
                                fontSize: rem(14),
                                border: "none",
                                background: "transparent",
                            }}
                            aria-label="Zoom percentage"
                        />
                    </div>

                    <ActionIcon
                        variant="subtle"
                        onClick={handleIncrement}
                        aria-label="Increase zoom"
                        title="Increase"
                        style={{
                            width: rem(60),
                            height: rem(48),
                        }}
                    >
                        <Plus size="1.2rem" />
                    </ActionIcon>
                </div>
            </div>
        </Stack>
    );
}
