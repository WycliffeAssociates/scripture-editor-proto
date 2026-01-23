import { Box, Button, Popover, Text } from "@mantine/core";
import type { LexicalEditor } from "lexical";
import { useRef, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import {
    lintErrorDetails,
    lintErrorItem,
    lintPopoverButton,
} from "@/app/ui/styles/modules/LintPopover.css.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import { rafUntilSuccessOrTimeout } from "@/core/data/utils/generic.ts";

type Props = {
    wrapperClassNames?: string;
};

export function LintPopover({ wrapperClassNames }: Props) {
    const { lint, editorRef } = useWorkspaceContext();
    const hasMessages = lint.messages.length > 0;
    const prevDomElSelected = useRef<HTMLElement | null>(null);
    const [lintPopoverIsOpen, setLintPopoverIsOpen] = useState(false);

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
                        size="xs"
                        variant="filled"
                        color="red"
                        className={lintPopoverButton}
                    >
                        {lint.messages.length} Issues
                    </Button>
                </Popover.Target>

                <Popover.Dropdown className="max-h-64 overflow-y-auto">
                    <ul
                        className="space-y-2 text-sm flex flex-col items-start"
                        data-testid={TESTING_IDS.lintPopover.container}
                    >
                        {lint.messages.map((msg) => (
                            <LintMessageItem
                                key={msg.nodeId}
                                msg={msg}
                                editorRef={editorRef}
                                prevDomElSelected={prevDomElSelected}
                            />
                        ))}
                    </ul>
                </Popover.Dropdown>
            </Popover>
        </div>
    );
}

type LintMessageItemProps = {
    msg: LintError;
    editorRef: React.RefObject<LexicalEditor | null>;
    prevDomElSelected: React.RefObject<HTMLElement | null>;
};

function LintMessageItem({
    msg,
    editorRef,
    prevDomElSelected,
}: LintMessageItemProps) {
    const { project, actions } = useWorkspaceContext();

    function findLintErrInDom() {
        let didScroll = false;
        editorRef.current?.read(() => {
            const editor = editorRef.current;
            if (!editor) return;
            const domEl = document.querySelector(
                `[data-id="${msg.nodeId}"]`,
            ) as HTMLElement;
            if (!domEl) return;
            if (prevDomElSelected.current) {
                prevDomElSelected.current.classList.remove("selected");
            }
            prevDomElSelected.current = domEl;
            domEl.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });
            domEl.classList.add("selected");
            didScroll = true;
            if (domEl.getAttribute("data-is-nested-editor-button") === "true") {
                domEl.click();
            }
        });
        return didScroll;
    }

    const handleNavigate = () => {
        const sidParsed = parseSid(msg.sid);
        if (!sidParsed) return;
        const currentBook = project.pickedFile.bookCode;
        const currentChapter = project.pickedChapter.chapNumber;
        if (
            sidParsed.book === currentBook &&
            sidParsed.chapter === currentChapter
        ) {
            findLintErrInDom();
        } else {
            actions.switchBookOrChapter(sidParsed.book, sidParsed.chapter);
            rafUntilSuccessOrTimeout(() => {
                return findLintErrInDom();
            }, 5000);
        }
    };

    return (
        <li className="w-full">
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
                        {msg.message}
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
                        {msg.fix.label}
                    </Button>
                )}
            </Box>
        </li>
    );
}
