import { useState } from "react";
import { parseSid, sortListBySidCanonical } from "@/core/data/bible/bible";
import { dedupeErrorMessagesList, type LintError } from "@/core/data/usfm/lint";

export type UseLintReturn = ReturnType<typeof useLint>;
type UseLintProps = {
    initialLintErrors: LintError[];
    currentChapter: number;
    currentBibleBookId: string;
};
export function useLint({
    initialLintErrors,
    currentChapter,
    currentBibleBookId,
}: UseLintProps) {
    // todo: like initial files data, this is that semi anti pattern of change in props won't sync without reload or an effect, but right now we just hard reload on project change
    const [messages, setMessage] = useState<LintError[]>(initialLintErrors);

    function mergeInNewErrorsFromChapter(errors: LintError[]) {
        console.log({ newErrors: errors });
        const filtered = messages.filter((m) => {
            const sidParsed = parseSid(m.sid);
            if (!sidParsed) return true;
            return (
                sidParsed.chapter !== currentChapter ||
                sidParsed.book !== currentBibleBookId
            );
        });
        const merged = [...filtered, ...errors];

        const ensureDeduped = sortListBySidCanonical(
            dedupeErrorMessagesList(merged),
        );

        setMessage(ensureDeduped);
        return ensureDeduped;
    }

    return {
        messages,
        setMessage,
        mergeInNewErrorsFromChapter,
    };
}
