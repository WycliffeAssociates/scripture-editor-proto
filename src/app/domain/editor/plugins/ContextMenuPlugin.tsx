import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Portal } from "@mantine/core";
import { useClickOutside } from "@mantine/hooks";
import {
    $getSelection,
    $isElementNode,
    $isLineBreakNode,
    $isRangeSelection,
    COMMAND_PRIORITY_HIGH,
    KEY_DOWN_COMMAND,
    type LexicalEditor,
} from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import type { EditorContext } from "../actions/types.ts";
import { useEditorContext } from "../hooks/useEditorContext.ts";
import { ActionPalette } from "./ContextMenu/ActionPalette.tsx";
import {
    clearContextMenuSelectionHighlight,
    showContextMenuSelectionHighlight,
} from "./ContextMenu/selectionHighlight.ts";

function calculateMenuPosition(
    touchPoint: { x: number; y: number },
    isMobile: boolean,
): { x: number; y: number } {
    if (isMobile) {
        const mobileWidth = Math.min(480, window.innerWidth * 0.95);
        return {
            x: window.innerWidth / 2 - mobileWidth / 2,
            y: window.innerHeight / 2 - 200,
        };
    }

    const menuWidth = 480; // 30rem
    const menuHeight = 500;
    const offset = 4;

    let x = touchPoint.x + offset;
    let y = touchPoint.y + offset;

    if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - offset;
    }
    if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - offset;
    }
    if (x < offset) x = offset;
    if (y < offset) y = offset;

    return { x, y };
}

export function NodeContextMenuPlugin() {
    const [editor] = useLexicalComposerContext();
    const [opened, setOpened] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [context, setContext] = useState<EditorContext | null>(null);
    const { isXs, isSm } = useWorkspaceMediaQuery();
    const { getContext } = useEditorContext();
    const closePalette = useCallback(() => {
        clearContextMenuSelectionHighlight();
        setOpened(false);
    }, []);
    const clickOutsideRef = useClickOutside(closePalette);

    const openedRef = useRef(opened);

    useEffect(() => {
        openedRef.current = opened;
    }, [opened]);

    const handleOpen = useCallback(
        (x: number, y: number) => {
            const ctx = getContext();
            setContext(ctx);
            const nativeSelection = window.getSelection();
            const nativeRange =
                nativeSelection && nativeSelection.rangeCount > 0
                    ? nativeSelection.getRangeAt(0)
                    : null;
            if (
                nativeRange &&
                !nativeRange.collapsed &&
                nativeSelection &&
                nativeSelection.toString().trim().length > 0 &&
                (!$isRangeSelection(ctx.selection) ||
                    !ctx.selection.isCollapsed())
            ) {
                showContextMenuSelectionHighlight(nativeRange);
            } else {
                clearContextMenuSelectionHighlight();
            }
            const isMobile = isXs || isSm;
            setPos(calculateMenuPosition({ x, y }, isMobile));
            setOpened(true);
        },
        [getContext, isXs, isSm],
    );

    const showTooltipNearSelection = useCallback(
        (editor: LexicalEditor) => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
                handleOpen(window.innerWidth / 2, window.innerHeight / 2);
                return true;
            }
            const nativeSel = window.getSelection();
            if (!nativeSel || nativeSel.rangeCount === 0) {
                handleOpen(window.innerWidth / 2, window.innerHeight / 2);
                return true;
            }

            const range = nativeSel.getRangeAt(0);
            let rect = range.getBoundingClientRect();

            if (!rect || (rect.width === 0 && rect.height === 0)) {
                const anchorNode = selection.anchor.getNode();
                if ($isElementNode(anchorNode)) {
                    const nthChild = anchorNode.getChildAtIndex(
                        selection.anchor.offset,
                    );
                    if ($isLineBreakNode(nthChild)) {
                        const dom = editor.getElementByKey(nthChild.getKey());
                        if (dom) {
                            const r = dom.getBoundingClientRect();
                            if (r.height > 0) rect = r;
                        }
                    }
                }
            }

            if (!rect || (rect.width === 0 && rect.height === 0)) {
                handleOpen(window.innerWidth / 2, window.innerHeight / 2);
                return true;
            }
            handleOpen(rect.left + rect.width / 2, rect.bottom + 6);
            return true;
        },
        [handleOpen],
    );

    useEffect(() => {
        function onContextMenu(e: MouseEvent) {
            e.preventDefault();
            handleOpen(e.clientX, e.clientY);
        }

        return editor.registerRootListener((root, prev) => {
            prev?.removeEventListener("contextmenu", onContextMenu);
            root?.addEventListener("contextmenu", onContextMenu);
        });
    }, [editor, handleOpen]);

    useEffect(() => {
        return editor.registerCommand(
            KEY_DOWN_COMMAND,
            (event: KeyboardEvent) => {
                if (openedRef.current) return false;

                const isCmdK =
                    (event.metaKey || event.ctrlKey) &&
                    event.key.toLowerCase() === "k";
                if (isCmdK) {
                    event.preventDefault();
                    editor.getEditorState().read(() => {
                        showTooltipNearSelection(editor);
                    });
                    return true;
                }

                const isTab = event.key === "Tab";
                if (!isTab) return false;
                if (event.shiftKey) return false;

                event.preventDefault();
                editor.getEditorState().read(() => {
                    showTooltipNearSelection(editor);
                });
                return true;
            },
            COMMAND_PRIORITY_HIGH,
        );
    }, [editor, showTooltipNearSelection]);

    useEffect(() => {
        return () => {
            clearContextMenuSelectionHighlight();
        };
    }, []);

    if (!opened || !context) return null;

    return (
        <Portal>
            <div
                ref={clickOutsideRef}
                data-testid={TESTING_IDS.contextMenu.container}
                style={{
                    position: "fixed",
                    top: pos.y,
                    left: pos.x,
                    zIndex: 2000,
                }}
            >
                <ActionPalette context={context} onClose={closePalette} />
            </div>
        </Portal>
    );
}
