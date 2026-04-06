import { Popover as BasePopover } from "@base-ui/react/popover";
import {
    type ComponentProps,
    type CSSProperties,
    createContext,
    type ReactNode,
    useContext,
} from "react";
import * as styles from "./popover.css.ts";

type Side = "top" | "right" | "bottom" | "left";
type Align = "start" | "center" | "end";

type TriggerProps = ComponentProps<typeof BasePopover.Trigger>;

type PopoverContextValue = {
    side: Side;
    align: Align;
    offset: number;
};

const PopoverContext = createContext<PopoverContextValue | null>(null);

export interface PopoverProps {
    children: ReactNode;
    opened?: boolean;
    defaultOpened?: boolean;
    onChange?: (opened: boolean) => void;
    position?:
        | "top"
        | "top-start"
        | "top-end"
        | "right"
        | "right-start"
        | "right-end"
        | "bottom"
        | "bottom-start"
        | "bottom-end"
        | "left"
        | "left-start"
        | "left-end";
    offset?: number;
    shadow?: "sm" | "md" | "lg";
    width?: number | string;
    closeOnClickOutside?: boolean;
    floatingStrategy?: "absolute" | "fixed";
}

function parsePosition(position: string): { side: Side; align: Align } {
    const parts = position.split("-");
    const side = parts[0] as Side;
    const align = (parts[1] || "center") as Align;
    return { side, align };
}

function usePopoverContext() {
    const context = useContext(PopoverContext);
    if (!context) {
        throw new Error(
            "Popover compound components must be used inside <Popover />",
        );
    }

    return context;
}

export function Popover({
    children,
    opened,
    defaultOpened,
    onChange,
    position = "bottom",
    offset = 8,
}: PopoverProps) {
    const { side, align } = parsePosition(position);

    return (
        <PopoverContext.Provider value={{ side, align, offset }}>
            <BasePopover.Root
                open={opened}
                defaultOpen={defaultOpened}
                onOpenChange={onChange}
            >
                {children}
            </BasePopover.Root>
        </PopoverContext.Provider>
    );
}

export interface PopoverTargetProps extends TriggerProps {
    asChild?: boolean;
}

export function PopoverTarget({ asChild, ...props }: PopoverTargetProps) {
    const triggerProps = asChild ? ({ asChild: true } as const) : {};
    return <BasePopover.Trigger {...triggerProps} {...props} />;
}

export interface PopoverDropdownProps {
    children: ReactNode;
    className?: string;
    p?: string;
}

export function PopoverDropdown({
    children,
    className,
    p,
}: PopoverDropdownProps) {
    const { side, align, offset } = usePopoverContext();
    const style = p ? ({ padding: p } satisfies CSSProperties) : undefined;

    // Inline fallback styles to ensure proper rendering
    const inlineStyles: CSSProperties = {
        backgroundColor: "var(--color-surfacePrimary, white)",
        border: "1px solid var(--color-surfaceBorder, #e0e0e0)",
        borderRadius: "var(--border-radius-md, 8px)",
        boxShadow: "var(--shadow-large, 0 4px 8px rgba(0,0,0,0.2))",
        opacity: 1,
        ...style,
    };

    return (
        <BasePopover.Portal>
            <BasePopover.Positioner
                side={side}
                align={align}
                sideOffset={offset}
                style={{ zIndex: 100 }}
            >
                <BasePopover.Popup
                    className={`${styles.popup} ${className || ""}`}
                    style={inlineStyles}
                >
                    {children}
                </BasePopover.Popup>
            </BasePopover.Positioner>
        </BasePopover.Portal>
    );
}
