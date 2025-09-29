import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $dfsIterator } from "@lexical/utils";
import {
    $getSelection,
    $isTextNode,
    CLEAR_HISTORY_COMMAND,
    type EditorState,
    type LexicalEditor,
    LineBreakNode,
    ParagraphNode,
    TextNode,
} from "lexical";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectContext } from "@/ui/contexts/ProjectContext";
import { USFMElementNode } from "@/domain/editor/nodes/USFMElementNode";
import { USFMDecoratorNode } from "@/domain/editor/nodes/USFMMarkerDecoratorNode";
import { USFMTextNode } from "@/domain/editor/nodes/USFMTextNode";
import { UseLineBreaks } from "@/domain/editor/plugins/AdjustLineBreaks";
import { CustomOnChangePlugin } from "@/domain/editor/plugins/CustomOnChangePlugin";
import { DecoratorFocusPlugin } from "@/domain/editor/plugins/DecoratorFocus";
import { SearchHighlightPlugin } from "@/domain/editor/plugins/LocalSearch";
import {
    type ChapterSearchResult,
    type SearchMatch,
    searchParsedFile,
} from "@/lib/editorNodeFunctions";
import { debounce } from "@/utils/general";
import { USFMNestedEditorNode } from "./nodes/USFMNestedEditorDecorator";

export function Editor() {
    const {
        editorRef,
        pickedChapter,
        allFiles,
        saveCurrentDirtyLexical,
        setSelectionSids,
    } = useProjectContext();
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedTerm, setDebouncedTerm] = useState(searchTerm);
    const [currentEditorState, setCurrentEditorState] =
        useState<EditorState | null>(null);

    const [lastViewed, setLastViewed] = useState<{
        filePath: string;
        chapterId: number;
    } | null>(null);

    // Update debouncedTerm 300ms after user stops typing
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedTerm(searchTerm);
        }, 300);

        return () => {
            clearTimeout(handler);
        };
    }, [searchTerm]);
    const wholeProjectMatchesSearch = useMemo(() => {
        if (!debouncedTerm || debouncedTerm.length < 3) return {};
        if (!allFiles) return {};
        // if (!currentEditorState) return {};

        console.time(`searching for ${debouncedTerm}`);
        const res =
            allFiles?.reduce<Record<string, ChapterSearchResult>>(
                (acc, file) => {
                    const r = searchParsedFile(file, debouncedTerm);
                    if (r.hasResults) acc[file.path] = r.results;
                    return acc;
                },
                {},
            ) ?? {};
        console.timeEnd(`searching for ${debouncedTerm}`);
        console.log({ res });
        return res;
    }, [allFiles, debouncedTerm]);

    // Populate editor whenever pickedChapter changes
    // biome-ignore lint/correctness/useExhaustiveDependencies: <Just first time. From there, run imperatively in setContentOnChapterOrFileChange>
    useEffect(() => {
        if (!pickedChapter?.lexicalState || !editorRef.current) return;
        const editorState = editorRef.current.parseEditorState(
            pickedChapter.lexicalState,
        );
        // console.log("setting editor state in useEffect");
        editorRef.current.setEditorState(editorState, { tag: "history-merge" });
        // Clear the history so we don't reset editor to previous chap/verse
        editorRef.current.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    }, []);

    if (!pickedChapter) {
        return <div>Select a file and chapter to edit</div>;
    }

    const initialConfig = {
        namespace: "USFMEditor",
        nodes: [
            USFMElementNode,
            USFMTextNode,
            ParagraphNode,
            USFMDecoratorNode,
            LineBreakNode,
            USFMNestedEditorNode,
        ],
        theme: {
            text: {
                bold: "font-bold",
                italic: "italic",
                underline: "underline",
            },
            paragraph: "my-2",
            usfmElement: "usfm-element",
            usfmText: "usfm-text",
        },
        onError: console.error,
    };

    function syncScroll(event: React.UIEvent<HTMLDivElement>) {
        console.time("onScroll");
        const containerB = document.querySelector(
            '[data-js="reference-editor-container"]',
        );
        if (!containerB) return;
        const containerA = event.target as HTMLDivElement;
        const containerTop = containerA.getBoundingClientRect().top;

        const elementsA = Array.from(
            containerA.querySelectorAll("[data-sid]"),
        ) as HTMLElement[];
        const firstVisibleA = elementsA.find(
            (el) => el.getBoundingClientRect().bottom > containerTop,
        );
        if (!firstVisibleA) return;
        const firstSidA = firstVisibleA.dataset.sid;
        const elementsB = Array.from(
            containerB.querySelectorAll("[data-sid]"),
        ) as HTMLElement[];
        const firstSidB = elementsB.find((el) => el.dataset.sid === firstSidA);
        if (!firstSidB) return;
        const targetTop =
            firstSidB.getBoundingClientRect().top -
            containerTop +
            containerB.scrollTop;

        firstSidB?.scrollIntoView({
            block: "start",
            behavior: "smooth",
        });
        console.timeEnd("onScroll");
    }

    return (
        <div>
            <div>
                {/* <input
          type="text"
          className="p-2 border rounded"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        /> */}
                {/* <Toolbar /> */}
            </div>
            <div className="flex gap-2">
                <div className="w-2/3">
                    <LexicalComposer initialConfig={initialConfig}>
                        <div className="editor-container relative h-full border rounded-lg overflow-hidden max-w-[80ch] w-[75ch]">
                            <div
                                className="h-full max-h-[80vh] overflow-auto p-4"
                                onScroll={(e) => debounce(syncScroll, 300)(e)}
                            >
                                <RichTextPlugin
                                    contentEditable={
                                        <ContentEditable
                                            className="min-h-full focus:outline-none p-4 w-full"
                                            aria-label="USFM Editor"
                                        />
                                    }
                                    ErrorBoundary={LexicalErrorBoundary}
                                />
                            </div>
                        </div>
                        <EditorRefPlugin editorRef={editorRef} />
                        <DecoratorFocusPlugin />
                        <UseLineBreaks />
                        <HistoryPlugin />
                        <CustomOnChangePlugin
                            ignoreHistoryMergeTagChange={true}
                            tagsToIgnore={new Set(["programmatic"])}
                            onSelectionChange={(editorState, editor, tags) => {
                                editor.read(() => {
                                    const selection = $getSelection();
                                    if (!selection) return;
                                    const nodesSelected = selection.getNodes();
                                    const sids = new Set<string>();
                                    nodesSelected.forEach((node) => {
                                        if (
                                            "getSid" in node &&
                                            typeof node.getSid === "function"
                                        ) {
                                            const sid = node.getSid();
                                            if (sid) sids.add(sid);
                                        }
                                    });
                                    setSelectionSids(sids);
                                    console.log(sids);
                                });
                            }}
                            onChange={(editorState, editor, tags) => {
                                console.time("onchangePlugin");
                                console.log("onchange", tags);
                                setCurrentEditorState(editorState);
                                if (tags.has("programmatic")) return;
                                console.time("onchange.editorState.toJSON");
                                const json = editorState.toJSON();
                                console.timeEnd("onchange.editorState.toJSON");
                                console.log("onchange saving dirty");
                                saveCurrentDirtyLexical(json);

                                console.timeEnd("onchangePlugin");
                            }}
                        />
                        <SearchHighlightPlugin
                            searchTerm={debouncedTerm}
                            currentEditorState={currentEditorState}
                        />
                    </LexicalComposer>
                </div>
                {editorRef.current && (
                    <div className="w-1/3">
                        <SearchResults
                            wholeProjectMatchesSearch={
                                wholeProjectMatchesSearch
                            }
                            editor={editorRef.current}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

type SearchResultProps = {
    wholeProjectMatchesSearch: Record<string, ChapterSearchResult>;
    editor: LexicalEditor;
};

export function SearchResults({
    wholeProjectMatchesSearch,
    editor,
}: SearchResultProps) {
    const { switchTo } = useProjectContext();
    const handleResultClick = useCallback(
        (filePath: string, chapterId: number, match: SearchMatch) => {
            switchTo(filePath, chapterId);

            // Highlight logic stays the same
            editor.update(() => {
                const textNode = $getNodeByCuid(match.cuid);
                if (!textNode || !$isTextNode(textNode)) return;

                const domNode = editor.getElementByKey(textNode.getKey());
                if (!domNode) return;

                // const [start, end] = match.indices[0];
                // const [_before, middle] = textNode.splitText(start, end);

                domNode.scrollIntoView({ behavior: "smooth", block: "center" });
                const textNodeDom = domNode.firstChild;
                if (!textNodeDom) return;
                const range = new Range();
                const matchHighlight = new Highlight();
                const [start, end] = match.indices[0];

                range.setStart(textNodeDom, start);
                range.setEnd(textNodeDom, end);
                matchHighlight.add(range);
                // middle?.setStyle("background-color: yellow;");
            });
        },
        [editor, switchTo],
    );
    return (
        <ul className="flex flex-col gap-2">
            {Object.entries(wholeProjectMatchesSearch).map(
                ([filePath, chapterResults]) =>
                    Object.entries(chapterResults).map(([chapterId, matches]) =>
                        matches.map((match, i) => (
                            <li
                                key={`${filePath}:${chapterId}:${match.cuid}:${i}`}
                                onKeyDown={() =>
                                    handleResultClick(
                                        filePath,
                                        Number(chapterId),
                                        match,
                                    )
                                }
                                onClick={() =>
                                    handleResultClick(
                                        filePath,
                                        Number(chapterId),
                                        match,
                                    )
                                }
                                className="cursor-pointer hover:bg-gray-200"
                            >
                                <span className="flex flex-col">
                                    <span>{match.sid}</span>
                                    <span>{match.text}</span>
                                </span>
                            </li>
                        )),
                    ),
            )}
        </ul>
    );
}

function $getNodeByCuid(cuid: string): TextNode | null {
    // console.log(`Looking for node with cuid ${cuid}`);
    for (const { node } of $dfsIterator()) {
        // console.log(node?.__cuid);
        if (node instanceof TextNode && (node as any).__cuid === cuid) {
            return node;
        }
    }
    return null;
}
