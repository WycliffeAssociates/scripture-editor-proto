import { Popover as BasePopover } from "@base-ui/react/popover";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  use,
  useMemo,
} from "react";

import { zLayer } from "@/app/ui/styles/zLayers.ts";

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
  const context = use(PopoverContext);
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
  const contextValue = useMemo(
    () => ({ side, align, offset }),
    [side, align, offset],
  );

  return (
    <PopoverContext.Provider value={contextValue}>
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

export function PopoverDropdown({ children, className }: PopoverDropdownProps) {
  const { side, align, offset } = usePopoverContext();

  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        side={side}
        align={align}
        sideOffset={offset}
        style={{ zIndex: zLayer.popover }}
      >
        <BasePopover.Popup className={`${styles.popup} ${className || ""}`}>
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
