import {
  $createRangeSelection,
  $getRoot,
  $setSelection,
  type LexicalEditor,
  type LexicalNode,
  type SerializedLexicalNode,
} from "lexical";
import {useState} from "react";
import {ParsedChapter, ParsedFile} from "@/app/data/parsedProject";
import {isSerializedElementNode} from "@/app/domain/editor/nodes/USFMElementNode";
import {isSerializedUSFMNestedEditorNode} from "@/app/domain/editor/nodes/USFMNestedEditorNode";
import {
  $isUSFMTextNode,
  isSerializedPlainTextUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import {type ParsedReference, parseSid} from "@/core/data/bible/bible";

type Props = {
  workingFiles: ParsedFile[];
  saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
  switchBookOrChapter: (
    file: string,
    chapter: number
  ) => ParsedChapter | undefined;
  editorRef: React.RefObject<LexicalEditor | null>;
};

type SearchResult = {
  sid: string;
  text: string;
  filePath: string;
  chapNum: number;
  parsedSid: ParsedReference | null;
};

type MatchInNode = {
  node: LexicalNode;
  start: number;
  end: number;
};

export type UseSearchReturn = ReturnType<typeof useProjectSearch>;

export function useProjectSearch({
  workingFiles,
  saveCurrentDirtyLexical,
  switchBookOrChapter,
  editorRef,
}: Props) {
  const [searchTerm, setSearch] = useState<string>("");
  const [replaceTerm, setReplaceTerm] = useState<string>("HARD CODE");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [currentMatches, setCurrentMatches] = useState<MatchInNode[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const [pickedResult, setPickedResult] = useState<SearchResult | null>(null);

  function searchProject() {
    const filesToSearch = saveCurrentDirtyLexical() || workingFiles;
    const allResults: SearchResult[] = [];

    for (const file of filesToSearch) {
      for (const chapter of file.chapters) {
        const serializedNodes = chapter.lexicalState.root.children;
        const sidRecord = reduceSerializedNodesToText(serializedNodes);

        for (const [sid, text] of Object.entries(sidRecord)) {
          if (text.toLowerCase().includes(searchTerm.toLowerCase())) {
            allResults.push({
              sid,
              text,
              filePath: file.path,
              chapNum: chapter.chapNumber,
              parsedSid: parseSid(sid),
            });
          }
        }
      }
    }

    console.log(allResults);
    setResults(allResults);
    setCurrentMatchIndex(0);
  }

  function pick(result: SearchResult) {
    setPickedResult(result);

    const newChapterState = switchBookOrChapter(
      result.filePath,
      result.chapNum
    );
    if (!newChapterState) return;

    queueMicrotask(() => {
      const editor = editorRef.current;
      if (!editor) return;

      editor.update(() => {
        const root = $getRoot();
        const searchMatches: MatchInNode[] = [];

        root.getAllTextNodes().forEach((node) => {
          const text = node.getTextContent();
          let index = text.toLowerCase().indexOf(searchTerm.toLowerCase());

          // Find ALL occurrences in this node
          while (index !== -1) {
            searchMatches.push({
              node,
              start: index,
              end: index + searchTerm.length,
            });
            index = text
              .toLowerCase()
              .indexOf(searchTerm.toLowerCase(), index + 1);
          }
        });

        setCurrentMatches(searchMatches);

        if (searchMatches.length > 0) {
          const firstOfSid = searchMatches.find(
            (m) => $isUSFMTextNode(m.node) && m.node.getSid() === result.sid
          );

          if (firstOfSid) {
            highlightAndScrollToMatch(firstOfSid, editor);
            setCurrentMatchIndex(searchMatches.indexOf(firstOfSid));
          }
        }
      });
    });
  }

  function highlightAndScrollToMatch(
    match: MatchInNode,
    editor: LexicalEditor
  ) {
    const selection = $createRangeSelection();
    selection.anchor.set(match.node.getKey(), match.start, "text");
    selection.focus.set(match.node.getKey(), match.end, "text");
    $setSelection(selection);

    const domEl = editor.getElementByKey(match.node.getKey());
    if (domEl) {
      domEl.scrollIntoView({block: "center", behavior: "smooth"});
    }
  }

  function nextMatch() {
    if (currentMatches.length === 0) return;

    const editor = editorRef.current;
    if (!editor) return;

    const nextIndex = (currentMatchIndex + 1) % currentMatches.length;
    setCurrentMatchIndex(nextIndex);

    editor.update(() => {
      highlightAndScrollToMatch(currentMatches[nextIndex], editor);
    });
  }

  function prevMatch() {
    if (currentMatches.length === 0) return;

    const editor = editorRef.current;
    if (!editor) return;

    const prevIndex =
      currentMatchIndex === 0
        ? currentMatches.length - 1
        : currentMatchIndex - 1;
    setCurrentMatchIndex(prevIndex);

    editor.update(() => {
      highlightAndScrollToMatch(currentMatches[prevIndex], editor);
    });
  }

  function replaceCurrentMatch() {
    if (currentMatches.length === 0 || !pickedResult) return;

    const editor = editorRef.current;
    if (!editor) return;

    const currentMatch = currentMatches[currentMatchIndex];

    editor.update(() => {
      const node = currentMatch.node;
      if (!$isUSFMTextNode(node)) return;

      const text = node.getTextContent();
      const newText =
        text.slice(0, currentMatch.start) +
        replaceTerm +
        text.slice(currentMatch.end);

      node.setTextContent(newText);
    });

    // Remove this result from the list since we've changed it
    const updatedResults = results.filter((r) => r.sid !== pickedResult.sid);
    setResults(updatedResults);

    // Find next result in same chapter/file
    const nextInChapter = updatedResults.find(
      (r) =>
        r.filePath === pickedResult.filePath &&
        r.chapNum === pickedResult.chapNum &&
        r.parsedSid &&
        pickedResult.parsedSid &&
        r.parsedSid.verseStart >= pickedResult.parsedSid.verseStart
    );

    if (nextInChapter) {
      pick(nextInChapter);
    } else {
      setCurrentMatches([]);
      setPickedResult(null);
    }
  }

  function replaceAllInChapter() {
    if (!pickedResult) return;

    const editor = editorRef.current;
    if (!editor) return;

    editor.update(() => {
      currentMatches.forEach((match) => {
        const node = match.node;
        if (!$isUSFMTextNode(node)) return;

        const text = node.getTextContent();
        const newText = text.replaceAll(searchTerm, replaceTerm);
        node.setTextContent(newText);
      });
    });

    // Remove all results from current chapter
    const updatedResults = results.filter(
      (r) =>
        !(
          r.filePath === pickedResult.filePath &&
          r.chapNum === pickedResult.chapNum
        )
    );
    setResults(updatedResults);
    setCurrentMatches([]);
    setPickedResult(null);
  }

  const hasNext = currentMatches.length > 0 && currentMatches.length > 1;
  const hasPrev = currentMatches.length > 0 && currentMatches.length > 1;

  return {
    searchTerm,
    setSearch,
    replaceTerm,
    setReplaceTerm,
    results,
    searchProject,
    pickSearchResult: pick,
    nextMatch,
    prevMatch,
    replaceCurrentMatch,
    replaceAllInChapter,
    currentMatchIndex,
    totalMatches: currentMatches.length,
    hasNext,
    hasPrev,
  };
}

function reduceSerializedNodesToText(
  serializedNodes: SerializedLexicalNode[]
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const node of serializedNodes) {
    if (isSerializedPlainTextUSFMTextNode(node) && node.sid) {
      result[node.sid] = (result[node.sid] || "") + node.text;
    }

    if (isSerializedElementNode(node)) {
      const childText = reduceSerializedNodesToText(node.children);
      for (const [sid, text] of Object.entries(childText)) {
        result[sid] = (result[sid] || "") + text;
      }
    }

    if (isSerializedUSFMNestedEditorNode(node)) {
      const childText = reduceSerializedNodesToText(
        node.editorState.root.children
      );
      for (const [sid, text] of Object.entries(childText)) {
        result[sid] = (result[sid] || "") + text;
      }
    }
  }

  return result;
}
