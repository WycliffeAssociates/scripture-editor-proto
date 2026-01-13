import { Button, Popover } from "@mantine/core";
import type { LexicalEditor } from "lexical";
import { useRef, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { lintPopoverButton } from "@/app/ui/styles/modules/LintPopover.css.ts";
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
                        {/* todo plural intl */}
                        {lint.messages.length} Issues
                        {/* {lint.messages.length > 1 ? "s" : ""} */}
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

    return (
        <li className="w-full whitespace-normal wrap-break-word">
            <Button
                data-testid={TESTING_IDS.lintPopover.errorItem}
                variant="subtle"
                color="gray"
                fullWidth
                justify="start"
                content="start"
                h="max-content"
                lh="1.4"
                onClick={() => {
                    const sidParsed = parseSid(msg.sid);
                    if (!sidParsed) return;
                    // if (sidParsed.)
                    // if same book and chap as current, scroll, else gonna have to set content and scroll:
                    const currentBook = project.pickedFile.bookCode;
                    const currentChapter = project.pickedChapter.chapNumber;
                    if (
                        sidParsed.book === currentBook &&
                        sidParsed.chapter === currentChapter
                    ) {
                        findLintErrInDom();
                    } else {
                        actions.switchBookOrChapter(
                            sidParsed.book,
                            sidParsed.chapter,
                        );
                        rafUntilSuccessOrTimeout(() => {
                            return findLintErrInDom();
                        }, 5000);
                    }
                }}
            >
                <span className="flex flex-col items-start text-start wrap-break-word whitespace-break-spaces ">
                    <span
                        data-testid={TESTING_IDS.lintPopover.errorSid}
                        className="font-semibold"
                    >
                        {msg.sid}
                    </span>
                    <span data-testid={TESTING_IDS.lintPopover.errorMessage}>
                        {msg.message}
                    </span>
                </span>
            </Button>
        </li>
    );
}
