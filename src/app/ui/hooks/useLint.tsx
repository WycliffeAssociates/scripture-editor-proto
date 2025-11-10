import { useRouter } from "@tanstack/react-router";
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
    const { directoryProvider } = useRouter().options.context;

    function mergeInNewErrorsFromChapter(errors: LintError[]) {
        console.log(errors);
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
        if (!ensureDeduped.length && messages.length) {
            // sett if we actually need to clear the messages:
            const allMessagesInDom = document.querySelectorAll(".lint-error");
            if (allMessagesInDom.length === 0) {
                setMessage([]);
            }
            return [];
        } else {
            const isDifferent =
                messages.length !== ensureDeduped.length ||
                ensureDeduped.some((m) => {
                    const existing = messages.find(
                        (e) => e.sid === m.sid && e.msgKey === m.msgKey,
                    );
                    return !existing;
                });
            if (isDifferent) {
                setMessage(ensureDeduped);
            }
        }
        return ensureDeduped;
    }

    return {
        messages,
        setMessage,
        mergeInNewErrorsFromChapter,
    };
}
