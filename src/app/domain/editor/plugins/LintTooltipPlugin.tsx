import { Portal, Text } from "@mantine/core";
import { useEditorLintTooltip } from "@/app/domain/editor/hooks/useEditorLintTooltip.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

export function LintTooltipPlugin() {
    const { lint } = useWorkspaceContext();
    const { hoveredErrors, tooltipPosition } = useEditorLintTooltip(
        lint.messages,
    );

    if (!hoveredErrors || !tooltipPosition) return null;

    const errorMessage = hoveredErrors.map((e) => e.message).join("\n");

    return (
        <Portal>
            <div
                style={{
                    position: "fixed",
                    top: tooltipPosition.y,
                    left: tooltipPosition.x,
                    transform: "translate(-50%, -100%)",
                    zIndex: 2000,
                }}
            >
                <div
                    style={{
                        backgroundColor: "var(--mantine-color-red-9)",
                        color: "white",
                        padding: "8px 12px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        maxWidth: "300px",
                        whiteSpace: "pre-wrap",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                    }}
                >
                    <Text size="xs" c="white" span>
                        {errorMessage}
                    </Text>
                </div>
            </div>
        </Portal>
    );
}
