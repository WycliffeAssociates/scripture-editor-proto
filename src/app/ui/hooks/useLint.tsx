import type { NodeKey } from "lexical";
import { useState } from "react";
import type { LintError } from "@/core/domain/usfm/parse";

export type LintMessage = {
    nodeKey: NodeKey;
    sid: string;
    message: Message;
};
export type UseLintReturn = ReturnType<typeof useLint>;
type UseLintProps = {
    initialLintErrors: LintError[];
};
export function useLint({ initialLintErrors }: UseLintProps) {
    // todo: like initial files data, this is that semi anti pattern of change in props won't sync without reload or an effect, but right now we just hard reload on project change
    const [messages, setMessage] = useState<LintError[]>(initialLintErrors);

    return {
        messages,
        setMessage,
        lintMessages,
    };
}

export const verseRangeMessages = {
    vrEmpty: {
        message: "This verse range is empty",
        className: "lint-verseRangeEmpty",
    },
    vrMalformed: {
        message: "This verse range is malformed",
        className: "lint-verseRangeMalformed",
    },
    vrDuplicate: {
        message: "This verse range is a duplicate of another",
        className: "lint-verseRangeDuplicate",
    },
    vrOutOfOrder: {
        message:
            "This verse range is out of order from the previous verse range",
        className: "lint-verseRangeOutOfOrder",
    },
} as const;

export const lintMessages = {
    ...verseRangeMessages,
} as const;

type Message = (typeof lintMessages)[keyof typeof lintMessages]["message"];
export const classNameToMsgMap: Map<string, Message> = Object.entries(
    lintMessages,
).reduce((acc, [key, value]) => {
    acc.set(value.className, value.message);
    return acc;
}, new Map<string, Message>());
