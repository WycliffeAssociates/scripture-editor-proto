import { useState } from "react";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";
import {
    areLintIssueListsEqual,
    replaceLintErrorsForBook,
    replaceLintErrorsForChapter,
} from "./lintState.ts";

export type UseLintReturn = ReturnType<typeof useLint>;
type UseLintProps = {
    initialLintErrors: LintIssue[];
};
export function useLint({ initialLintErrors }: UseLintProps) {
    // todo: like initial files data, this is that semi anti pattern of change in props won't sync without reload or an effect, but right now we just hard reload on project change
    const [messages, setMessage] = useState<LintIssue[]>(initialLintErrors);

    function replaceErrorsForBook(book: string, newErrors: LintIssue[]) {
        setMessage((prevMessages) => {
            const nextMessages = replaceLintErrorsForBook(
                prevMessages,
                book,
                newErrors,
            );
            return areLintIssueListsEqual(prevMessages, nextMessages)
                ? prevMessages
                : nextMessages;
        });
    }

    function replaceErrorsForChapter(
        book: string,
        chapter: number,
        newErrors: LintIssue[],
    ) {
        setMessage((prevMessages) => {
            const nextMessages = replaceLintErrorsForChapter(
                prevMessages,
                book,
                chapter,
                newErrors,
            );
            return areLintIssueListsEqual(prevMessages, nextMessages)
                ? prevMessages
                : nextMessages;
        });
    }

    return {
        messages,
        setMessage,
        replaceErrorsForBook,
        replaceErrorsForChapter,
        updateErrorsForChapter: replaceErrorsForChapter,
    };
}
