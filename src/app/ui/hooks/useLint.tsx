import { useState } from "react";
import {
    areLintErrorListsEqual,
    type LintError,
} from "@/core/data/usfm/lint.ts";
import {
    replaceLintErrorsForBook,
    replaceLintErrorsForChapter,
} from "./lintState.ts";

export type UseLintReturn = ReturnType<typeof useLint>;
type UseLintProps = {
    initialLintErrors: LintError[];
};
export function useLint({ initialLintErrors }: UseLintProps) {
    // todo: like initial files data, this is that semi anti pattern of change in props won't sync without reload or an effect, but right now we just hard reload on project change
    const [messages, setMessage] = useState<LintError[]>(initialLintErrors);

    function replaceErrorsForBook(book: string, newErrors: LintError[]) {
        setMessage((prevMessages) => {
            const nextMessages = replaceLintErrorsForBook(
                prevMessages,
                book,
                newErrors,
            );
            return areLintErrorListsEqual(prevMessages, nextMessages)
                ? prevMessages
                : nextMessages;
        });
    }

    function replaceErrorsForChapter(
        book: string,
        chapter: number,
        newErrors: LintError[],
    ) {
        setMessage((prevMessages) => {
            const nextMessages = replaceLintErrorsForChapter(
                prevMessages,
                book,
                chapter,
                newErrors,
            );
            return areLintErrorListsEqual(prevMessages, nextMessages)
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
