import { Portal, Text } from "@mantine/core";
import { useEditorLintTooltip } from "@/app/domain/editor/hooks/useEditorLintTooltip.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import {
    formatLintIssueMessage,
    formatTokenFixLabel,
} from "@/app/ui/i18n/usfmOnionLocalization.ts";
import * as styles from "@/app/ui/styles/modules/LintTooltipOverlay.css.ts";

export function LintTooltipPlugin() {
    const { actions, lint } = useWorkspaceContext();
    const { hoveredErrors, tooltipPosition } = useEditorLintTooltip(
        lint.messages,
    );

    if (!hoveredErrors || !tooltipPosition) return null;

    return (
        <Portal>
            <div
                className={styles.host}
                data-js="lint-tooltip-overlay"
                style={{
                    top: tooltipPosition.y,
                    left: tooltipPosition.x,
                }}
            >
                <div className={styles.card}>
                    {hoveredErrors.map((error) => (
                        <div
                            key={`${error.tokenId ?? error.relatedTokenId}:${error.code}:${error.sid}`}
                            className={styles.row}
                        >
                            <Text className={styles.message} span>
                                {formatLintIssueMessage(error)}
                            </Text>
                            {error.fix ? (
                                <button
                                    type="button"
                                    className={styles.fixButton}
                                    onClick={() => actions.fixLintError(error)}
                                >
                                    {formatTokenFixLabel(error.fix)}
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
        </Portal>
    );
}
