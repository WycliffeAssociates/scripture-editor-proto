import { useLingui } from "@lingui/react/macro";
import { ActionIcon, Popover, Tooltip } from "@mantine/core";
import { Search as IconSearch } from "lucide-react";
import {
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { SearchPopoverControls } from "@/app/ui/components/blocks/Search.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

type DragPosition = { x: number; y: number };

type DragState = {
    pointerId: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
};

type ResizeState = {
    pointerId: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    left: number;
    top: number;
};

const VIEWPORT_GUTTER_PX = 8;
const MIN_POPOVER_WIDTH_PX = 320;
const MIN_POPOVER_HEIGHT_PX = 220;

export function SearchInput() {
    const { search } = useWorkspaceContext();
    const { isSm } = useWorkspaceMediaQuery();
    const { t } = useLingui();
    const dropdownRef = useRef<HTMLDivElement | null>(null);
    const dragStateRef = useRef<DragState | null>(null);
    const resizeStateRef = useRef<ResizeState | null>(null);
    const [position, setPosition] = useState<DragPosition | null>(null);
    const [size, setSize] = useState<{ width: number; height: number } | null>(
        null,
    );
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);

    const hasCustomPlacement = position !== null || size !== null;

    const toggleSearch = () => {
        search.setIsSearchPaneOpen((o) => !o);
        setTimeout(() => {
            const input = document.querySelector(
                'input[data-js="search-input"]',
            ) as HTMLInputElement | null;
            input?.focus();
        }, 50);
    };

    const clampPosition = useCallback(
        (nextX: number, nextY: number, width: number, height: number) => {
            const docEl = document.documentElement;
            const viewportWidth = docEl.clientWidth || window.innerWidth;
            const viewportHeight = docEl.clientHeight || window.innerHeight;
            const minX = VIEWPORT_GUTTER_PX;
            const minY = VIEWPORT_GUTTER_PX;
            const maxX = Math.max(minX, viewportWidth - width - minX);
            const maxY = Math.max(
                minY,
                viewportHeight - height - VIEWPORT_GUTTER_PX,
            );
            return {
                x: Math.min(Math.max(nextX, minX), maxX),
                y: Math.min(Math.max(nextY, minY), maxY),
            };
        },
        [],
    );

    const clampSize = useCallback(
        (
            nextWidth: number,
            nextHeight: number,
            left: number,
            top: number,
            minContentHeight: number,
        ) => {
            const docEl = document.documentElement;
            const viewportWidth = docEl.clientWidth || window.innerWidth;
            const viewportHeight = docEl.clientHeight || window.innerHeight;
            const maxWidth = Math.max(
                MIN_POPOVER_WIDTH_PX,
                viewportWidth - left - VIEWPORT_GUTTER_PX,
            );
            const minimumHeight = Math.max(
                MIN_POPOVER_HEIGHT_PX,
                minContentHeight,
            );
            const maxHeight = Math.max(
                minimumHeight,
                viewportHeight - top - VIEWPORT_GUTTER_PX,
            );
            return {
                width: Math.min(
                    Math.max(nextWidth, MIN_POPOVER_WIDTH_PX),
                    maxWidth,
                ),
                height: Math.min(
                    Math.max(nextHeight, minimumHeight),
                    maxHeight,
                ),
            };
        },
        [],
    );

    const getMinContentHeight = useCallback(() => {
        const dropdownEl = dropdownRef.current;
        if (!dropdownEl) return MIN_POPOVER_HEIGHT_PX;
        const contentEl = dropdownEl.querySelector(
            '[data-js="search-popover-content"]',
        ) as HTMLElement | null;
        const measured = Math.ceil(
            contentEl?.scrollHeight ?? dropdownEl.scrollHeight,
        );
        return Math.max(MIN_POPOVER_HEIGHT_PX, measured);
    }, []);

    const resetPosition = useCallback(() => {
        setPosition(null);
        setSize(null);
        setIsDragging(false);
        setIsResizing(false);
        dragStateRef.current = null;
        resizeStateRef.current = null;
    }, []);

    const handlePointerDown = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (event.button !== 0) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-no-drag="true"]')) {
                return;
            }

            const dropdownEl = dropdownRef.current;
            if (!dropdownEl) return;
            const handleEl = event.currentTarget;
            const rect = dropdownEl.getBoundingClientRect();
            const anchoredPosition = clampPosition(
                rect.left,
                rect.top,
                size?.width ?? rect.width,
                size?.height ?? rect.height,
            );
            setPosition(anchoredPosition);

            dragStateRef.current = {
                pointerId: event.pointerId,
                offsetX: event.clientX - anchoredPosition.x,
                offsetY: event.clientY - anchoredPosition.y,
                width: size?.width ?? rect.width,
                height: size?.height ?? rect.height,
            };
            setSize({
                width: size?.width ?? rect.width,
                height: size?.height ?? rect.height,
            });
            handleEl.setPointerCapture(event.pointerId);
            setIsDragging(true);
        },
        [clampPosition, size?.height, size?.width],
    );

    const handleResizePointerDown = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (event.button !== 0) return;
            const dropdownEl = dropdownRef.current;
            if (!dropdownEl) return;

            const handleEl = event.currentTarget;
            const rect = dropdownEl.getBoundingClientRect();
            const anchoredPosition = clampPosition(
                rect.left,
                rect.top,
                size?.width ?? rect.width,
                size?.height ?? rect.height,
            );
            setPosition(anchoredPosition);

            const nextSize = clampSize(
                size?.width ?? rect.width,
                size?.height ?? rect.height,
                anchoredPosition.x,
                anchoredPosition.y,
                getMinContentHeight(),
            );
            setSize(nextSize);

            resizeStateRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                startWidth: nextSize.width,
                startHeight: nextSize.height,
                left: anchoredPosition.x,
                top: anchoredPosition.y,
            };
            handleEl.setPointerCapture(event.pointerId);
            setIsResizing(true);
            event.preventDefault();
        },
        [
            clampPosition,
            clampSize,
            getMinContentHeight,
            size?.height,
            size?.width,
        ],
    );

    const finishDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
        const isDragPointer =
            dragStateRef.current?.pointerId === event.pointerId;
        const isResizePointer =
            resizeStateRef.current?.pointerId === event.pointerId;
        if (!isDragPointer && !isResizePointer) return;
        if (
            "hasPointerCapture" in event.currentTarget &&
            event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (isDragPointer) {
            dragStateRef.current = null;
            setIsDragging(false);
        }
        if (isResizePointer) {
            resizeStateRef.current = null;
            setIsResizing(false);
        }
    }, []);

    const handlePointerMove = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            const resize = resizeStateRef.current;
            if (resize && resize.pointerId === event.pointerId) {
                event.preventDefault();
                const deltaX = event.clientX - resize.startX;
                const deltaY = event.clientY - resize.startY;
                setSize(
                    clampSize(
                        resize.startWidth + deltaX,
                        resize.startHeight + deltaY,
                        resize.left,
                        resize.top,
                        getMinContentHeight(),
                    ),
                );
                return;
            }

            const drag = dragStateRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            event.preventDefault();
            setPosition(
                clampPosition(
                    event.clientX - drag.offsetX,
                    event.clientY - drag.offsetY,
                    drag.width,
                    drag.height,
                ),
            );
        },
        [clampPosition, clampSize, getMinContentHeight],
    );

    useEffect(() => {
        if (!position && !size) return;
        const dropdownEl = dropdownRef.current;
        if (!dropdownEl) return;

        const onResize = () => {
            const rect = dropdownEl.getBoundingClientRect();
            const activeSize = size ?? {
                width: rect.width,
                height: rect.height,
            };
            const nextPos = clampPosition(
                position?.x ?? rect.left,
                position?.y ?? rect.top,
                activeSize.width,
                activeSize.height,
            );
            if (
                !position ||
                nextPos.x !== position.x ||
                nextPos.y !== position.y
            ) {
                setPosition(nextPos);
            }

            if (size) {
                const nextSize = clampSize(
                    size.width,
                    size.height,
                    nextPos.x,
                    nextPos.y,
                    getMinContentHeight(),
                );
                if (
                    nextSize.width !== size.width ||
                    nextSize.height !== size.height
                ) {
                    setSize(nextSize);
                }
            }
        };

        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [clampPosition, clampSize, getMinContentHeight, position, size]);

    if (isSm) {
        return (
            <Tooltip label={t`Search`} withArrow position="top">
                <ActionIcon
                    variant={search.isSearchPaneOpen ? "filled" : "subtle"}
                    color={search.isSearchPaneOpen ? "dark" : "gray"}
                    data-testid={TESTING_IDS.searchTrigger}
                    aria-label={t`Search`}
                    onClick={toggleSearch}
                >
                    <IconSearch size={16} />
                </ActionIcon>
            </Tooltip>
        );
    }

    return (
        <Popover
            opened={search.isSearchPaneOpen}
            onChange={(opened) => search.setIsSearchPaneOpen(opened)}
            position="bottom-end"
            withArrow
            shadow="lg"
            offset={8}
            closeOnClickOutside={false}
            floatingStrategy="fixed"
            middlewares={{ flip: false, shift: false }}
        >
            <Popover.Target>
                <Tooltip label={t`Search`} withArrow position="top">
                    <ActionIcon
                        variant={search.isSearchPaneOpen ? "filled" : "subtle"}
                        color={search.isSearchPaneOpen ? "dark" : "gray"}
                        data-testid={TESTING_IDS.searchTrigger}
                        aria-label={t`Search`}
                        onClick={toggleSearch}
                    >
                        <IconSearch size={16} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <SearchPopoverControls
                dropdownRef={dropdownRef}
                dropdownStyle={
                    position
                        ? {
                              position: "fixed",
                              left: position.x,
                              top: position.y,
                              width: size?.width,
                              height: size?.height,
                              margin: 0,
                              transform: "none",
                          }
                        : undefined
                }
                dragHandleProps={{
                    onPointerDown: handlePointerDown,
                    onPointerMove: handlePointerMove,
                    onPointerUp: finishDrag,
                    onPointerCancel: finishDrag,
                }}
                resizeHandleProps={{
                    onPointerDown: handleResizePointerDown,
                    onPointerMove: handlePointerMove,
                    onPointerUp: finishDrag,
                    onPointerCancel: finishDrag,
                }}
                onResetPosition={resetPosition}
                onHeaderDoubleClickReset={() => {
                    if (!hasCustomPlacement) return;
                    resetPosition();
                }}
                isMoved={hasCustomPlacement}
                isDragging={isDragging}
                isResizing={isResizing}
            />
        </Popover>
    );
}
