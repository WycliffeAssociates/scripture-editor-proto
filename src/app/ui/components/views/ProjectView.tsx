import {Button, Popover} from "@mantine/core";
import {$getNodeByKey, HISTORY_MERGE_TAG} from "lexical";
import {useRef, useState} from "react";
import {MainEditor} from "@/app/ui/components/blocks/Editor";
import {Toolbar} from "@/app/ui/components/blocks/Toolbar";
import {useProjectContext} from "@/app/ui/contexts/ProjectContext";

export function ProjectView() {
  const {search, lint, editorRef} = useProjectContext();
  const hasMessages = lint.messages.length > 0;
  const prevSelected = useRef<HTMLElement | null>(null);
  const [lintPopoverIsOpen, setLintPopoverIsOpen] = useState(false);
  return (
    <div className="grid grid-rows-[auto_1fr] h-screen ">
      <nav>
        <Toolbar />
      </nav>
      <div className="flex h-full overflow-y-auto">
        {search.results.length > 0 && (
          <ul className="w-1/3 bg-gray-100 gap-2 flex flex-col max-h-[calc(100vh-5rem)] overflow-y-auto px-2">
            {search.results.map((result) => (
              <li
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    search.pickSearchResult(result);
                  }
                }}
                className="text-xs flex flex-col gap-1"
                key={result.sid}
                onClick={() => search.pickSearchResult(result)}
              >
                <span className="font-bold">{result.sid}</span>
                {result.text}
              </li>
            ))}
          </ul>
        )}
        <main className="h-full overflow-y-auto max-w-prose mx-auto relative">
          {hasMessages && (
            <div className="absolute top-4 right-4 z-50">
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
                      <li key={msg.nodeKey}>
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
                                if (prevSelected.current) {
                                  prevSelected.current.classList.remove(
                                    "selected"
                                  );
                                }
                                prevSelected.current = el;
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
                    ))}
                  </ul>
                </Popover.Dropdown>
              </Popover>
            </div>
          )}
          <MainEditor />
        </main>
      </div>
    </div>
  );
}
