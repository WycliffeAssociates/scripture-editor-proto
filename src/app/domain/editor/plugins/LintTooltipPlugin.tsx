import { createPortal } from "react-dom";
import { DATA_JS } from "@/app/data/constants.ts";
import { useEditorLintTooltip } from "@/app/domain/editor/hooks/useEditorLintTooltip.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import {
    formatLintIssueMessage,
    formatTokenFixLabel,
} from "@/app/ui/i18n/usfmOnionLocalization.ts";
import * as styles from "@/app/ui/styles/modules/LintTooltipOverlay.css.ts";

/**
 * Final presentation step for lint hover state inside the live editor.
 *
 * The linting pipeline annotates nodes and DOM with issue metadata; this plugin
 * turns that hover state into a visible tooltip and optional quick-fix affordance.
 */
export function LintTooltipPlugin() {
    const { actions, lint } = useWorkspaceContext();
    const {
        hoveredErrors,
        tooltipPosition,
        onTooltipMouseEnter,
        onTooltipMouseLeave,
    } = useEditorLintTooltip(lint.messages);

    if (!hoveredErrors || !tooltipPosition) return null;
    return createPortal(
        <div
            className={styles.host}
            data-js={DATA_JS.lintTooltipOverlay}
            style={{
                top: tooltipPosition.y,
                left: tooltipPosition.x,
            }}
        >
            <div
                className={styles.card}
                onMouseEnter={onTooltipMouseEnter}
                onMouseLeave={onTooltipMouseLeave}
            >
                {hoveredErrors.map((error) => (
                    <div
                        key={`${error.tokenId ?? error.relatedTokenId}:${error.code}:${error.sid}`}
                        className={styles.row}
                    >
                        <span className={styles.message}>
                            {formatLintIssueMessage(error)}
                        </span>
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
        </div>,
        document.body,
    );
}
