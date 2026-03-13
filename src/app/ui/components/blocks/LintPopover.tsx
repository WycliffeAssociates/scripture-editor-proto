import { Box, Button, Popover, Text } from "@mantine/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LexicalEditor } from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import {
    formatLintIssueMessage,
    formatTokenFixLabel,
} from "@/app/ui/i18n/usfmOnionLocalization.ts";
import {
    lintErrorDetails,
    lintErrorItem,
    lintErrorList,
    lintErrorListItem,
    lintPopoverButton,
    lintPopoverDropdown,
    lintPopoverScrollArea,
} from "@/app/ui/styles/modules/LintPopover.css.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import { rafUntilSuccessOrTimeout } from "@/core/data/utils/generic.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

type Props = {
    wrapperClassNames?: string;
};

export function LintPopover({ wrapperClassNames }: Props) {
    const { lint, editorRef } = useWorkspaceContext();
    const hasMessages = lint.messages.length > 0;
    const prevDomElSelected = useRef<HTMLElement | null>(null);
    const [lintPopoverIsOpen, setLintPopoverIsOpen] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: lint.messages.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: () => 88,
        overscan: 6,
        enabled: lintPopoverIsOpen,
        measureElement: (element) => element.getBoundingClientRect().height,
    });

    useEffect(() => {
        if (!lintPopoverIsOpen) return;

        const frame = requestAnimationFrame(() => {
            virtualizer.measure();
            virtualizer.scrollToOffset(0);
        });

        return () => cancelAnimationFrame(frame);
    }, [lintPopoverIsOpen, virtualizer]);

    const copyLintDiagnostics = useCallback(async () => {
        const payload = {
            generatedAt: new Date().toISOString(),
            diagnostics: lint.messages,
        };
        try {
            await navigator.clipboard.writeText(
                JSON.stringify(payload, null, 2),
            );
        } catch (e) {
            console.error("Failed to copy lint diagnostics JSON", e);
        }
    }, [lint.messages]);

    if (!hasMessages) return null;

    return (
        <div className={wrapperClassNames}>
            <Popover
                data-testid={TESTING_IDS.lintPopover.triggerButton}
                opened={lintPopoverIsOpen}
                onDismiss={() => setLintPopoverIsOpen(false)}
                position="bottom-start"
                shadow="md"
                withArrow
                withinPortal={false}
                width={400}
            >
                <Popover.Target>
                    <Button
                        onClick={() => setLintPopoverIsOpen(!lintPopoverIsOpen)}
                        size="sm"
                        variant="filled"
                        color="red"
                        className={lintPopoverButton}
                    >
                        {lint.messages.length} Issues
                    </Button>
                </Popover.Target>

                <Popover.Dropdown className={lintPopoverDropdown}>
                    {import.meta.env.DEV && (
                        <Button
                            variant="light"
                            h={148}
                            size="xs"
                            fullWidth
                            mb="xs"
                            onClick={copyLintDiagnostics}
                        >
                            Copy Debug Info
                        </Button>
                    )}
                    <div
                        ref={scrollContainerRef}
                        className={lintPopoverScrollArea}
                        data-testid={TESTING_IDS.lintPopover.container}
                    >
                        <ul
                            className={lintErrorList}
                            style={{
                                height: `${virtualizer.getTotalSize()}px`,
                                width: "100%",
                                position: "relative",
                            }}
                        >
                            {virtualizer.getVirtualItems().map((virtualRow) => {
                                const msg = lint.messages[virtualRow.index];
                                if (!msg) return null;
                                return (
                                    <li
                                        key={`${msg.tokenId ?? msg.relatedTokenId}-${msg.sid}-${msg.code}-${virtualRow.index}`}
                                        className={lintErrorListItem}
                                        data-index={virtualRow.index}
                                        ref={virtualizer.measureElement}
                                        style={{
                                            position: "absolute",
                                            top: 0,
                                            left: 0,
                                            width: "100%",
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                    >
                                        <LintMessageItem
                                            msg={msg}
                                            editorRef={editorRef}
                                            prevDomElSelected={
                                                prevDomElSelected
                                            }
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </Popover.Dropdown>
            </Popover>
        </div>
    );
}

type LintMessageItemProps = {
    msg: LintIssue;
    editorRef: React.RefObject<LexicalEditor | null>;
    prevDomElSelected: React.RefObject<HTMLElement | null>;
};

function isRenderedElement(el: HTMLElement): boolean {
    return Boolean(
        el.offsetWidth || el.offsetHeight || el.getClientRects().length,
    );
}

function findVisibleLintTarget(nodeId: string): HTMLElement | null {
    const direct = document.querySelector(
        `[data-id="${nodeId}"]`,
    ) as HTMLElement | null;
    if (!direct) return null;
    if (isRenderedElement(direct)) return direct;

    const tokenType = direct.getAttribute("data-token-type");
    const isHiddenMarkerTarget =
        tokenType === "marker" || tokenType === "endMarker";
    if (!isHiddenMarkerTarget) return direct;

    const acceptableTokenTypes = new Set(["numberRange", "text"]);
    let probe = direct.nextElementSibling as HTMLElement | null;

    while (probe) {
        if (probe.tagName === "BR") {
            probe = probe.nextElementSibling as HTMLElement | null;
            continue;
        }
        const probeTokenType = probe.getAttribute("data-token-type");
        if (
            probeTokenType &&
            acceptableTokenTypes.has(probeTokenType) &&
            isRenderedElement(probe)
        ) {
            return probe;
        }
        probe = probe.nextElementSibling as HTMLElement | null;
    }

    probe = direct.previousElementSibling as HTMLElement | null;
    while (probe) {
        if (probe.tagName === "BR") {
            probe = probe.previousElementSibling as HTMLElement | null;
            continue;
        }
        const probeTokenType = probe.getAttribute("data-token-type");
        if (
            probeTokenType &&
            acceptableTokenTypes.has(probeTokenType) &&
            isRenderedElement(probe)
        ) {
            return probe;
        }
        probe = probe.previousElementSibling as HTMLElement | null;
    }

    return direct;
}

type SerializedNodeLike = {
    type?: string;
    id?: string;
    children?: SerializedNodeLike[];
    editorState?: {
        root?: {
            children?: SerializedNodeLike[];
        };
    };
};

function findContainingNestedEditorId(
    nodes: SerializedNodeLike[],
    targetId: string,
    activeNestedId?: string,
): string | null {
    for (const node of nodes) {
        const nodeId = node.id ?? "";
        const isNestedNode = node.type === "usfm-nested-editor";
        const nestedIdToUse = isNestedNode ? nodeId : activeNestedId;

        if (nodeId === targetId) {
            return activeNestedId ?? (isNestedNode ? nodeId : null);
        }

        if (isNestedNode) {
            const nestedChildren = node.editorState?.root?.children ?? [];
            const foundInsideNested = findContainingNestedEditorId(
                nestedChildren,
                targetId,
                nodeId,
            );
            if (foundInsideNested) return foundInsideNested;
        }

        const normalChildren = node.children ?? [];
        if (normalChildren.length) {
            const foundInChildren = findContainingNestedEditorId(
                normalChildren,
                targetId,
                nestedIdToUse,
            );
            if (foundInChildren) return foundInChildren;
        }
    }

    return null;
}

function openContainingNestedEditorForNodeId(args: {
    editorRef: React.RefObject<LexicalEditor | null>;
    nodeId: string;
    openAttempts: Set<string>;
}): boolean {
    const currentEditor = args.editorRef.current;
    if (!currentEditor) return false;

    const serialized = currentEditor.getEditorState().toJSON() as {
        root?: { children?: SerializedNodeLike[] };
    };
    const rootChildren = serialized.root?.children ?? [];
    if (!rootChildren.length) return false;

    const nestedId = findContainingNestedEditorId(rootChildren, args.nodeId);
    if (!nestedId) return false;

    const nestedButton = document.querySelector(
        `[data-is-nested-editor-button="true"][data-id="${nestedId}"]`,
    ) as HTMLElement | null;
    if (!nestedButton) return false;
    if (nestedButton.getAttribute("data-opened") === "true") return false;
    if (args.openAttempts.has(nestedId)) return false;

    args.openAttempts.add(nestedId);
    nestedButton.scrollIntoView({
        behavior: "smooth",
        block: "center",
    });
    nestedButton.click();
    return true;
}

function LintMessageItem({
    msg,
    editorRef,
    prevDomElSelected,
}: LintMessageItemProps) {
    const { project, actions } = useWorkspaceContext();

    function findLintErrInDom(openAttempts: Set<string>) {
        const tokenId = msg.tokenId ?? msg.relatedTokenId;
        if (!tokenId) return false;
        const domEl = findVisibleLintTarget(tokenId);

        if (!domEl) {
            openContainingNestedEditorForNodeId({
                editorRef,
                nodeId: tokenId,
                openAttempts,
            });
            return false;
        }

        if (prevDomElSelected.current) {
            prevDomElSelected.current.classList.remove("selected");
        }
        prevDomElSelected.current = domEl;

        domEl.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });
        domEl.classList.add("selected");

        if (domEl.getAttribute("data-is-nested-editor-button") === "true") {
            const nestedId = domEl.getAttribute("data-id") ?? "";
            const isOpen = domEl.getAttribute("data-opened") === "true";
            if (!isOpen && (!nestedId || !openAttempts.has(nestedId))) {
                if (nestedId) openAttempts.add(nestedId);
                domEl.click();
            }
            return false;
        }

        return true;
    }

    const handleNavigate = () => {
        if (!msg.sid) return;
        const sidParsed = parseSid(msg.sid);
        if (!sidParsed) return;
        const openAttempts = new Set<string>();
        const navigateAttempt = () => {
            return findLintErrInDom(openAttempts);
        };
        const currentBook = project.pickedFile.bookCode;
        const currentChapter =
            project.pickedChapter?.chapNumber ?? project.currentChapter;
        if (
            sidParsed.book === currentBook &&
            sidParsed.chapter === currentChapter
        ) {
            if (navigateAttempt()) return;
            rafUntilSuccessOrTimeout(() => {
                return navigateAttempt();
            }, 5000);
        } else {
            actions.switchBookOrChapter(sidParsed.book, sidParsed.chapter);
            rafUntilSuccessOrTimeout(() => {
                return navigateAttempt();
            }, 5000);
        }
    };

    return (
        <Box
            className={lintErrorItem}
            data-testid={TESTING_IDS.lintPopover.errorItem}
            onClick={handleNavigate}
        >
            <Box className={lintErrorDetails}>
                <Text
                    size="xs"
                    fw={700}
                    data-testid={TESTING_IDS.lintPopover.errorSid}
                >
                    {msg.sid}
                </Text>
                <Text
                    size="xs"
                    data-testid={TESTING_IDS.lintPopover.errorMessage}
                >
                    {formatLintIssueMessage(msg)}
                </Text>
            </Box>
            {msg.fix && (
                <Button
                    size="compact-xs"
                    variant="light"
                    color="blue"
                    mt="xs"
                    w="max-content"
                    onClick={(e) => {
                        e.stopPropagation();
                        actions.fixLintError(msg);
                    }}
                >
                    {formatTokenFixLabel(msg.fix)}
                </Button>
            )}
        </Box>
    );
}
