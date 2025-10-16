import {Button, Popover} from "@mantine/core";
import {$getNodeByKey, HISTORY_MERGE_TAG, LexicalEditor} from "lexical";
import {useRef, useState} from "react";
import {useWorkspaceContext} from "@/app/ui/contexts/WorkspaceContext";
import type {LintMessage} from "@/app/ui/hooks/useLint";

type Props = {
  wrapperClassNames?: string;
};
export function LintPopover({wrapperClassNames}: Props) {
  const {lint, editorRef} = useWorkspaceContext();
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
                key={msg.nodeKey}
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
  msg: LintMessage;
  editorRef: React.RefObject<LexicalEditor | null>;
  prevDomElSelected: React.RefObject<HTMLElement | null>;
};
function LintMessageItem({
  msg,
  editorRef,
  prevDomElSelected,
}: LintMessageItemProps) {
  return (
    <li>
      <Button
        variant="subtle"
        color="gray"
        fullWidth
        onClick={() => {
          editorRef.current?.read(() => {
            const editor = editorRef.current;
            if (!editor) return;
            const el = editor.getElementByKey(msg.nodeKey);
            editor.update(
              () => {
                const node = $getNodeByKey(msg.nodeKey);
                node?.selectEnd();
              },
              {
                tag: [HISTORY_MERGE_TAG],
                skipTransforms: true,
              }
            );
            if (el) {
              if (prevDomElSelected.current) {
                prevDomElSelected.current.classList.remove("selected");
              }
              prevDomElSelected.current = el;
              el.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
              el.classList.add("selected");
            }
          });
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
