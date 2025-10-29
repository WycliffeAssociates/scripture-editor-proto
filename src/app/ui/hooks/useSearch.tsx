import {
    $getRoot,
    type LexicalEditor,
    type LexicalNode,
    type SerializedLexicalNode,
} from "lexical";
import { useEffect, useState } from "react";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode";
import {
    $isUSFMTextNode,
    isSerializedPlainTextUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import {
    makeSid,
    type ParsedReference,
    parseSid,
} from "@/core/data/bible/bible";

type Props = {
    workingFiles: ParsedFile[];
    saveCurrentDirtyLexical: ({
        doSetWorkingFiles,
    }: {
        doSetWorkingFiles?: boolean;
    }) => ParsedFile[] | undefined;
    switchBookOrChapter: (
        file: string,
        chapter: number,
    ) => ParsedChapter | undefined;
    editorRef: React.RefObject<LexicalEditor | null>;
    pickedFile: ParsedFile;
    pickedChapter: ParsedChapter;
};

type SearchResult = {
    sid: string;
    text: string;
    filePath: string;
    bibleIdentifier: string;
    chapNum: number;
    parsedSid: ParsedReference | null;
    isCaseMismatch: boolean;
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
    pickedFile,
    pickedChapter,
}: Props) {
    const [searchTerm, setSearch] = useState<string>("");
    const [replaceTerm, setReplaceTerm] = useState<string>("HARD CODE");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [currentMatches, setCurrentMatches] = useState<MatchInNode[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
    const [pickedResult, setPickedResult] = useState<SearchResult | null>(null);
    const [isSearchPaneOpen, setIsSearchPaneOpen] = useState(false);
    const [matchWholeWord, setMatchWholeWord] = useState(false);
    const [matchCase, setMatchCase] = useState(false);

    const currentChapterSid = makeSid({
        bookId: pickedFile.bibleIdentifier,
        chapter: pickedChapter.chapNumber,
    });

    useEffect(() => {
        if (!searchTerm) {
            CSS.highlights.clear();
            return;
        }
    }, [searchTerm]);

    function searchProject() {
        CSS.highlights.clear();

        // This is a mutable ref returned here with latest. Don't mutate right now
        const filesToSearch =
            saveCurrentDirtyLexical({ doSetWorkingFiles: true }) ||
            workingFiles;
        const allResults: SearchResult[] = [];

        for (const file of filesToSearch) {
            for (const chapter of file.chapters) {
                const serializedNodes = chapter.lexicalState.root.children;
                const sidRecord = reduceSerializedNodesToText(serializedNodes);

                for (const [sid, text] of Object.entries(sidRecord)) {
                    const matchResult = findMatch({
                        matchCase,
                        searchTerm,
                        matchWholeWord,
                        textToSearch: text,
                    });
                    if (matchResult.isMatch) {
                        allResults.push({
                            sid,
                            text,
                            filePath: file.path,
                            bibleIdentifier: file.bibleIdentifier,
                            chapNum: chapter.chapNumber,
                            parsedSid: parseSid(sid),
                            isCaseMismatch:
                                searchTerm !== matchResult.matchedTerm,
                        });
                    }
                }
            }
        }

        console.log(allResults);
        setResults(allResults);
        const firstInThisChap = allResults.findIndex((r) =>
            r.sid.startsWith(currentChapterSid),
        );
        if (firstInThisChap !== -1) {
            setCurrentMatchIndex(firstInThisChap);
            pick(allResults[firstInThisChap]);
        } else {
            setCurrentMatchIndex(0);
        }
    }

    function pick(result: SearchResult) {
        CSS.highlights.clear();

        setPickedResult(result);

        const newChapterState = switchBookOrChapter(
            result.bibleIdentifier,
            result.chapNum,
        );
        if (!newChapterState) return;

        queueMicrotask(() => {
            const editor = editorRef.current;
            if (!editor) return;

            editor.read(() => {
                const root = $getRoot();
                const searchMatches: MatchInNode[] = [];

                root.getAllTextNodes().forEach((node) => {
                    const text = node.getTextContent();
                    let index = text
                        .toLowerCase()
                        .indexOf(searchTerm.toLowerCase());

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
                        (m) =>
                            $isUSFMTextNode(m.node) &&
                            m.node.getSid() === result.sid,
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
        editor: LexicalEditor,
    ) {
        // const selection = $createRangeSelection();
        // selection.anchor.set(match.node.getKey(), match.start, "text");
        // selection.focus.set(match.node.getKey(), match.end, "text");
        // $setSelection(selection);

        const domEl = editor.getElementByKey(match.node.getKey());
        if (domEl) {
            const domTextContent = domEl.textContent;
            domEl.scrollIntoView({ block: "center", behavior: "smooth" });
            if (!domTextContent) return;
            let startIndex = 0;
            const matchHighlight = new Highlight();
            while (true) {
                //  already checked case sesnitivity
                const index = domTextContent
                    .toLowerCase()
                    .indexOf(searchTerm.toLowerCase(), startIndex);
                if (index === -1) break;

                // If TextNode contains multiple child nodes, pick firstChild
                const range = new Range();
                const firstChild = domEl.firstChild || domEl;
                range.setStart(firstChild, index);
                range.setEnd(firstChild, index + searchTerm.length);
                matchHighlight.add(range);
                startIndex = index + searchTerm.length;
            }

            CSS.highlights.set("matched-search", matchHighlight);
        }
    }

    function nextMatch() {
        if (currentMatches.length === 0) return;

        const editor = editorRef.current;
        if (!editor) return;

        const nextIndex = (currentMatchIndex + 1) % currentMatches.length;
        setCurrentMatchIndex(nextIndex);

        editor.read(() => {
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

        editor.read(() => {
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
        const updatedResults = results.filter(
            (r) => r.sid !== pickedResult.sid,
        );
        setResults(updatedResults);

        // Find next result in same chapter/file
        const nextInChapter = updatedResults.find(
            (r) =>
                r.filePath === pickedResult.filePath &&
                r.chapNum === pickedResult.chapNum &&
                r.parsedSid &&
                pickedResult.parsedSid &&
                r.parsedSid.verseStart >= pickedResult.parsedSid.verseStart,
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
                ),
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
        isSearchPaneOpen,
        setIsSearchPaneOpen,
        matchWholeWord,
        setMatchWholeWord,
        matchCase,
        setMatchCase,
    };
}

function reduceSerializedNodesToText(
    serializedNodes: SerializedLexicalNode[],
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
                node.editorState.root.children,
            );
            for (const [sid, text] of Object.entries(childText)) {
                result[sid] = (result[sid] || "") + text;
            }
        }
    }

    return result;
}

/**
 * Escapes special characters in a string for use in a regular expression.
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
function escapeRegex(str: string) {
    // Escapes characters with special meaning in regular expressions.
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds a match in a given text based on search term and options.
 * @param {string} textToSearch The full text to search within.
 * @param {string} searchTerm The term to find.
 * @param {boolean} matchCase If true, the search is case-sensitive.
 * @param {boolean} matchWholeWord If true, only matches full words.
 * @returns {{isMatch: boolean, matchedTerm: string | null}}
 *          An object indicating if a match was found, and the actual matched term
 *          from the original text (preserving its case).
 */
type FindMatchArgs = {
    textToSearch: string;
    searchTerm: string;
    matchCase: boolean;
    matchWholeWord: boolean;
};
function findMatch({
    textToSearch,
    searchTerm,
    matchCase,
    matchWholeWord,
}: FindMatchArgs) {
    if (!searchTerm) {
        return { isMatch: false, matchedTerm: null };
    }

    if (matchWholeWord) {
        // --- Whole Word Logic (using Regex) ---
        const escapedTerm = escapeRegex(searchTerm);
        // \b is a word boundary. This ensures we match "cat" but not "caterpillar".
        const regex = new RegExp(
            `\\b${escapedTerm}\\b`,
            matchCase ? "g" : "gi",
        );

        const result = regex.exec(textToSearch); // Use exec to get the first match details

        if (result) {
            // result[0] is the actual text that was matched.
            return { isMatch: true, matchedTerm: result[0] };
        }
    } else {
        // --- Substring Logic (using indexOf for performance) ---
        if (matchCase) {
            const index = textToSearch.indexOf(searchTerm);
            if (index > -1) {
                return { isMatch: true, matchedTerm: searchTerm };
            }
        } else {
            // We still use indexOf on the lowercased string to find the position,
            // but we need to preserve the original case for the matched term.
            const index = textToSearch
                .toLowerCase()
                .indexOf(searchTerm.toLowerCase());
            if (index > -1) {
                const originalTerm = textToSearch.substring(
                    index,
                    index + searchTerm.length,
                );
                return { isMatch: true, matchedTerm: originalTerm };
            }
        }
    }
    if (!searchTerm) {
        return { isMatch: false, matchedTerm: null };
    }

    if (matchWholeWord) {
        // --- Whole Word Logic (using Regex) ---
        const escapedTerm = escapeRegex(searchTerm);
        // \b is a word boundary. This ensures we match "cat" but not "caterpillar".
        const regex = new RegExp(
            `\\b${escapedTerm}\\b`,
            matchCase ? "g" : "gi",
        );

        const result = regex.exec(textToSearch); // Use exec to get the first match details

        if (result) {
            // result[0] is the actual text that was matched.
            return { isMatch: true, matchedTerm: result[0] };
        }
    } else {
        // --- Substring Logic (using indexOf for performance) ---
        if (matchCase) {
            const index = textToSearch.indexOf(searchTerm);
            if (index > -1) {
                return { isMatch: true, matchedTerm: searchTerm };
            }
        } else {
            // We still use indexOf on the lowercased string to find the position,
            // but we return a slice of the *original* string.
            const index = textToSearch
                .toLowerCase()
                .indexOf(searchTerm.toLowerCase());
            if (index > -1) {
                const originalTerm = textToSearch.substring(
                    index,
                    index + searchTerm.length,
                );
                return { isMatch: true, matchedTerm: originalTerm };
            }
        }
    }

    // If no match was found in any scenario
    return { isMatch: false, matchedTerm: null };
}
