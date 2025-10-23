import { useState } from "react";
import { parseSid } from "@/core/data/bible/bible";
import type { LintError } from "@/core/domain/usfm/lint";

export type UseLintReturn = ReturnType<typeof useLint>;
type UseLintProps = {
    initialLintErrors: LintError[];
    currentChapter: number;
};
export function useLint({ initialLintErrors, currentChapter }: UseLintProps) {
    // todo: like initial files data, this is that semi anti pattern of change in props won't sync without reload or an effect, but right now we just hard reload on project change
    const [messages, setMessage] = useState<LintError[]>(initialLintErrors);

    function mergeInNewErrorsFromChapter(errors: LintError[]) {
        const merged = [
            // keep messages not in the current chapter
            ...messages.filter((m) => {
                const sidParsed = parseSid(m.sid);
                if (!sidParsed) return true;
                return sidParsed.chapter !== currentChapter;
            }),
            // add all for current chapter (new source of truth)
            ...errors,
        ];

        // optional: dedupe by sid+message
        const deduped = Array.from(
            new Map(merged.map((m) => [`${m.sid}:${m.message}`, m])).values(),
        );

        deduped.sort((a, b) => {
            const aParsed = parseSid(a.sid);
            const bParsed = parseSid(b.sid);
            if (!aParsed || !bParsed) return 0;
            return aParsed.chapter - bParsed.chapter;
        });
        setMessage(deduped);
        return deduped;
    }

    return {
        messages,
        setMessage,
        mergeInNewErrorsFromChapter,
    };
}
