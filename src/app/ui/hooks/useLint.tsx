import { useMemo, useState } from "react";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";
import {
    flattenLintMessagesByBook,
    type LintMessagesByBook,
    replaceLintErrorsForBook,
    replaceLintErrorsForChapter,
} from "./lintState.ts";

export type UseLintReturn = ReturnType<typeof useLint>;
type UseLintProps = {
    initialLintErrorsByBook: LintMessagesByBook;
};
export function useLint({ initialLintErrorsByBook }: UseLintProps) {
    // todo: like initial files data, this is that semi anti pattern of change in props won't sync without reload or an effect, but right now we just hard reload on project change
    const [messagesByBook, setMessagesByBook] = useState<LintMessagesByBook>(
        initialLintErrorsByBook,
    );
    const messages = useMemo(
        () => flattenLintMessagesByBook(messagesByBook),
        [messagesByBook],
    );

    function replaceErrorsForBook(book: string, newErrors: LintIssue[]) {
        setMessagesByBook((prevMessagesByBook) => {
            return replaceLintErrorsForBook(
                prevMessagesByBook,
                book,
                newErrors,
            );
        });
    }

    function replaceErrorsForChapter(
        book: string,
        chapter: number,
        newErrors: LintIssue[],
    ) {
        setMessagesByBook((prevMessagesByBook) => {
            return replaceLintErrorsForChapter(
                prevMessagesByBook,
                book,
                chapter,
                newErrors,
            );
        });
    }

    return {
        messagesByBook,
        messages,
        setMessage: setMessagesByBook,
        replaceErrorsForBook,
        replaceErrorsForChapter,
        updateErrorsForChapter: replaceErrorsForChapter,
    };
}
