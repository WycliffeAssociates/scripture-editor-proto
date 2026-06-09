import { Popover as BasePopover } from "@base-ui/react/popover";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { DecoratedFinding } from "@/app/domain/editor/annotations/finding.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "@/app/ui/styles/modules/AnnotationPopover.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

/**
 * Inline annotation popover (formerly `LintFixPopover`).
 *
 * A dumb renderer for the findings spine: each `DecoratedFinding` shows as an
 * icon + message and one button per `action`. It knows nothing about onion vs
 * sous — normalizers produce `Finding`s and the decorator registry attaches
 * message + actions upstream (see annotations/decorators/decorateFinding.tsx).
 *
 * A real Base-UI Popover so placement gets automatic flip/shift collision
 * handling (the old hand-rolled tooltip used an unconditional
 * `translateY(-110%)` that pushed the card outside its container near edges).
 *
 * Two modes:
 *  - ANNOTATION mode: pass `annotations`; open derives from `anchor` +
 *    `annotations`.
 *  - CUSTOM mode: pass `children` to render arbitrary content in the same shell
 *    (e.g. the verse-marker suggest affordance), controlling visibility via
 *    `open`.
 */

export type AnnotationPopoverProps = {
    /** The element to anchor against. */
    anchor: HTMLElement | null;
    /** Annotation mode: items to show. Ignored when `children` is provided. */
    annotations?: DecoratedFinding[] | null;
    /**
     * Custom-content mode: render arbitrary content in the same popover shell.
     * When set, `annotations` is ignored and you control visibility via `open`.
     */
    children?: ReactNode;
    /** Explicit open override; defaults to `anchor && annotations.length > 0`. */
    open?: boolean;
    /** Keep-open / dismiss handlers driven by the hover state machine. */
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    /** Preferred side; flips automatically when it would overflow. */
    side?: "top" | "bottom" | "left" | "right";
    /** Optional `data-js` on the popup, so external hover logic can detect it. */
    popupDataJs?: string;
};

export function AnnotationPopover({
    anchor,
    annotations,
    children,
    open,
    onMouseEnter,
    onMouseLeave,
    side = "top",
    popupDataJs,
}: AnnotationPopoverProps) {
    const isOpen =
        Boolean(anchor) &&
        (open ?? Boolean(annotations && annotations.length > 0));

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
                            (annotations && annotations.length > 0 ? (
                                <AnnotationList annotations={annotations} />
                            ) : null)}
                    </BasePopover.Popup>
                </BasePopover.Positioner>
            </BasePopover.Portal>
        </BasePopover.Root>
    );
}

// Icon + message per annotation, then one full-width button per action.
function AnnotationList({ annotations }: { annotations: DecoratedFinding[] }) {
    return (
        <div className={styles.body}>
            {annotations.map((annotation) => (
                <div key={annotation.id} className={styles.item}>
                    <div className={styles.head}>
                        <span className={styles.icon} aria-hidden="true">
                            <AlertCircle size={16} />
                        </span>
                        <span className={styles.message}>
                            {annotation.message}
                        </span>
                    </div>
                    {annotation.actions.map((action) => (
                        <Button
                            key={action.id}
                            variant={
                                action.kind === "default"
                                    ? "secondary"
                                    : "primary"
                            }
                            size="sm"
                            className={styles.fullButton}
                            leftIcon={action.icon}
                            onClick={() => action.run()}
                        >
                            {action.label}
                        </Button>
                    ))}
                </div>
            ))}
        </div>
    );
}
