import { Button, Popover } from "@mantine/core";
import { $getNodeByKey, HISTORY_MERGE_TAG, type LexicalEditor } from "lexical";
import { useRef, useState } from "react";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext";
import type { LintMessage } from "@/app/ui/hooks/useLint";
import { parseSid } from "@/core/data/bible/bible";
import type { LintError } from "@/core/domain/usfm/parse";

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
                opened={lintPopoverIsOpen}
                onDismiss={() => setLintPopoverIsOpen(false)}
                position="bottom-end"
                shadow="md"
                withArrow
            >
                <Popover.Target>
                    <Button
                        onClick={() => setLintPopoverIsOpen(!lintPopoverIsOpen)}
                        size="xs"
                        variant="filled"
                        color="red"
                        className="z-50"
                    >
                        {lint.messages.length} Lint issue
                        {lint.messages.length > 1 ? "s" : ""}
                    </Button>
                </Popover.Target>

                <Popover.Dropdown className="max-h-64 overflow-y-auto">
                    <ul className="space-y-2 text-sm flex flex-col items-start">
                        {lint.messages.map((msg) => (
                            <LintMessageItem
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
        editorRef.current?.read(() => {
            const editor = editorRef.current;
            if (!editor) return;
            const domEl = document.querySelector(
                `[data-is-lint-error="true"][data-id="${msg.nodeId}"]`,
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
            if (domEl.getAttribute("data-is-nested-editor-button") === "true") {
                domEl.click();
            }
        });
    }

    return (
        <li>
            <Button
                variant="subtle"
                color="gray"
                fullWidth
                onClick={() => {
                    const sidParsed = parseSid(msg.sid);
                    if (!sidParsed) return;
                    // if (sidParsed.)
                    // if same book and chap as current, scroll, else gonna have to set content and scroll:
                    const currentBook = project.pickedFile.bibleIdentifier;
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
                        setTimeout(() => {
                            findLintErrInDom();
                        }, 100);
                    }
                }}
                className=""
            >
                <span className="flex flex-col items-start text-left">
                    <span className="font-semibold">{msg.sid}</span>
                    <span>{msg.message}</span>
                </span>
            </Button>
        </li>
    );
}
