// biome-ignore lint/style/useImportType: <explanation>

import type {NodeKey} from "lexical";
import {useState} from "react";
export type LintMessage = {
  nodeKey: NodeKey;
  sid: string;
  message: Message;
};
export type UseLintReturn = ReturnType<typeof useLint>;
export function useLint() {
  const [messages, setMessage] = useState<LintMessage[]>([]);

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
    message: "This verse range is out of order from the previous verse range",
    className: "lint-verseRangeOutOfOrder",
  },
} as const;

export const lintMessages = {
  ...verseRangeMessages,
} as const;

type Message = (typeof lintMessages)[keyof typeof lintMessages]["message"];
export const classNameToMsgMap: Map<string, Message> = Object.entries(
  lintMessages
).reduce((acc, [key, value]) => {
  acc.set(value.className, value.message);
  return acc;
}, new Map<string, Message>());
