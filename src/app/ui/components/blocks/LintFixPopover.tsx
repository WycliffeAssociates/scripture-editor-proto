import { Popover as BasePopover } from "@base-ui/react/popover";
import { AlertCircle, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import {
    formatLintIssueMessage,
    formatTokenFixLabel,
} from "@/app/ui/i18n/usfmOnionLocalization.ts";
import * as styles from "@/app/ui/styles/modules/LintFixPopover.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Inline lint-fix popover.
 *
 * A real Base-UI Popover so placement gets automatic flip/shift collision
 * handling (the old hand-rolled tooltip used an unconditional
 * `translateY(-110%)` that pushed the card outside its container near edges).
 *
 * Two modes:
 *  - LINT mode: pass `errors`; each issue renders as an icon + message and (if
 *    it has a fix) a full-width apply button. Open derives from `anchor` +
 *    `errors`.
 *  - CUSTOM mode: pass `children` to render arbitrary content in the same shell
 *    (e.g. the verse-marker suggest affordance), controlling visibility via
 *    `open`.
 */

export type LintFixPopoverProps = {
    /** The element to anchor against. */
    anchor: HTMLElement | null;
    /** Lint mode: issues to show. Ignored when `children` is provided. */
    errors?: LintIssue[] | null;
    /** Apply a fix — wraps `actions.fixLintError` at the real call site. */
    onApplyFix?: (error: LintIssue) => void;
    /**
     * Custom-content mode: render arbitrary content in the same popover shell.
     * When set, `errors` is ignored and you control visibility via `open`.
     */
    children?: ReactNode;
    /** Explicit open override; defaults to `anchor && errors.length > 0`. */
    open?: boolean;
    /** Keep-open / dismiss handlers driven by the hover state machine. */
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    /** Preferred side; flips automatically when it would overflow. */
    side?: "top" | "bottom" | "left" | "right";
    /** Optional `data-js` on the popup, so external hover logic can detect it. */
    popupDataJs?: string;
};

function issueKey(error: LintIssue): string {
    return `${error.tokenId ?? error.relatedTokenId ?? "?"}:${error.code}:${error.sid ?? ""}`;
}

export function LintFixPopover({
    anchor,
    errors,
    onApplyFix,
    children,
    open,
    onMouseEnter,
    onMouseLeave,
    side = "top",
    popupDataJs,
}: LintFixPopoverProps) {
    const isOpen =
        Boolean(anchor) && (open ?? Boolean(errors && errors.length > 0));

    return (
        <BasePopover.Root open={isOpen}>
            <BasePopover.Portal>
                <BasePopover.Positioner
                    anchor={anchor}
                    side={side}
                    align="center"
                    sideOffset={8}
                    collisionPadding={8}
                    style={{ zIndex: zLayer.floatingOverlay }}
                >
                    <BasePopover.Popup
                        className={styles.popup}
                        data-js={popupDataJs}
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                    >
                        {children ??
                            (errors && errors.length > 0 ? (
                                <LintIssueList
                                    errors={errors}
                                    onApplyFix={onApplyFix ?? (() => undefined)}
                                />
                            ) : null)}
                    </BasePopover.Popup>
                </BasePopover.Positioner>
            </BasePopover.Portal>
        </BasePopover.Root>
    );
}

// Icon + message per issue, then a full-width primary apply button when the
// issue carries a fix.
function LintIssueList({
    errors,
    onApplyFix,
}: {
    errors: LintIssue[];
    onApplyFix: (error: LintIssue) => void;
}) {
    return (
        <div className={styles.body}>
            {errors.map((error) => (
                <div key={issueKey(error)} className={styles.item}>
                    <div className={styles.head}>
                        <span className={styles.icon} aria-hidden="true">
                            <AlertCircle size={16} />
                        </span>
                        <span className={styles.message}>
                            {formatLintIssueMessage(error)}
                        </span>
                    </div>
                    {error.fix ? (
                        <Button
                            variant="primary"
                            size="sm"
                            className={styles.fullButton}
                            leftIcon={<Wand2 size={14} />}
                            onClick={() => onApplyFix(error)}
                        >
                            {formatTokenFixLabel(error.fix)}
                        </Button>
                    ) : null}
                </div>
            ))}
        </div>
    );
}
