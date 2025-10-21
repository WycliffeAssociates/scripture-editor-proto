import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type EditorState,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
} from "lexical";
import {UsfmTokenTypes} from "@/app/data/editor";
import {
  $createUSFMTextNode,
  $isUSFMTextNode,
  $isVerseRangeTextNode,
  type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import {$serializedLexicalToUsfm} from "@/app/domain/editor/serialization/lexicalToUsfm";
import {
  classNameToMsgMap,
  type LintMessage,
  lintMessages,
} from "@/app/ui/hooks/useLint";
import {type ParsedReference, parseSid} from "@/core/data/bible/bible";
import {guidGenerator} from "@/core/data/utils/generic";
import {parseUSFMChapter} from "@/core/domain/usfm/parse";
import {initBaseTokenContext} from "@/core/domain/usfm/parse-v2";

type LintVersesArgs = {
  editorState: EditorState;
  editor: LexicalEditor;
};
type LintVerseCn = (typeof lintMessages)[keyof typeof lintMessages];
export function lintVerseRangeReferences({
  editorState,
  editor,
}: LintVersesArgs) {
  const messages: Array<LintMessage> = [];
  editorState.read(() => {
    const root = $getRoot();

    type VerseRangeReduce = {
      malformed: Array<{
        node: USFMTextNode;
        sid: string;
        reason: LintVerseCn;
      }>;
      valid: Array<{
        node: USFMTextNode;
        sid: string;
        reference: ParsedReference;
      }>;
    };
    // todo:
    // root.getAllTextNodes().map((node) => node.exportJSON())
    // then pass to
    const allVerseRanges = root.getAllTextNodes().reduce(
      (acc, node) => {
        if ($isVerseRangeTextNode(node)) {
          const sid = node.getSid().trim();
          const textContent = node.getTextContent().trim();
          if (!textContent) {
            acc.malformed.push({
              node,
              sid,
              reason: lintMessages.vrEmpty,
            });
            return acc;
          }
          const isVerseBridge = textContent.includes("-");
          const verseStart = isVerseBridge
            ? Number(textContent.split("-")[0])
            : Number(textContent);
          const verseEnd = isVerseBridge
            ? Number(textContent.split("-")[1])
            : verseStart;
          const sidParsed = parseSid(sid);
          // chapters have stuff like this: 1CO 1
          if (!sidParsed) {
            acc.malformed.push({
              node,
              sid,
              reason: lintMessages.vrMalformed,
            });
            return acc;
          }
          // using first sid to get what new one would be
          const newSid = sidParsed.getNewParsedReference({
            verseStart,
            verseEnd,
          });
          const newSidParsed = parseSid(newSid.toSidString());
          if (!newSidParsed) {
            acc.malformed.push({
              node,
              sid,
              reason: lintMessages.vrMalformed,
            });
            return acc;
          }

          if (newSidParsed?.isBookChapOnly) return acc;
          acc.valid.push({
            node,
            reference: newSidParsed,
            sid: newSid.toSidString(),
          });
        }
        return acc;
      },
      {valid: [], malformed: []} as VerseRangeReduce
    );

    const classNameTracker: {
      [nodeKey: string]: {
        node: USFMTextNode;
        pendingSid: string;
        classNames: LintVerseCn[];
      };
    } = {};
    const lintArgs = {
      allVerseRanges: allVerseRanges.valid,
      classNameTracker,
    };
    // Mark duplicates
    determineDuplicate(lintArgs);

    // Check order (based on numeric start)
    determineOutOfOrder(lintArgs);

    allVerseRanges.malformed.forEach(({node, reason}) => {
      const existing = classNameTracker[node.getKey()] ?? {
        node,
        classNames: [],
      };
      existing.classNames.push(reason);
      classNameTracker[node.getKey()] = existing;
    });

    //easier to loop everything below and then conidtionally call editor.update, cuase if no changes actually happen, even calling editor.update can trigger unwanted loops
    const updates: Array<() => void> = [];

    // classNames lints
    Object.entries(classNameTracker).forEach(
      ([_, {node, classNames, pendingSid}]) => {
        const currentClassNamesOnNode = new Set(node.getClassNames());
        const pendingClassNames = new Set(classNames.map((c) => c.className));

        if (pendingClassNames.size === 0 && currentClassNamesOnNode.size > 0) {
          // make sure there are no classnames on this node;
          currentClassNamesOnNode.forEach((c) => {
            updates.push(() => node.setClassName(c, false));
          });
          return;
        }
        // for each one on current and not in pending, remove:
        currentClassNamesOnNode.forEach((c) => {
          // @ts-expect-error: Set check
          if (!pendingClassNames.has(c) && c !== "lint-error") {
            updates.push(() => node.setClassName(c, false));
          }
        });
        // for each one in pending and not on current, add:
        pendingClassNames.forEach((c) => {
          const msg = classNameToMsgMap.get(c);
          if (!msg) return;
          messages.push({
            nodeKey: node.getKey(),
            message: msg,
            sid: pendingSid,
          });
          if (!currentClassNamesOnNode.has(c)) {
            updates.push(() => {
              node.setClassName(c, true);
              node.setClassName("lint-error", true);
            });
          }
        });
      }
    );

    if (updates.length > 0) {
      editor.update(() => {
        updates.forEach((update) => {
          update();
        });
      });
    }
  });
  return messages;
}

export function lintAll({editorState, editor}: LintVersesArgs) {
  // todo: fix the lint side to take a less strict token. See what it might entail to take editorSTate to usfm -> parse + lint to automatically descend into nestedEditors without having to recurse here?
  console.time("lint all via parse core");
  debugger;
  const newUsfm = $serializedLexicalToUsfm(editor);
  if (!newUsfm) return;
  //   debugger;
  //   todo: did above todo, but maybe tokens instead of round tripped usfm. But do have to manually descend into any nestedEditor here:   if we create new ids on type, we want to be able to querySelectThoseLater: Or, update the nodes that have error via; Not sure there's a clean way to do such right now just round tripped also maybe options to skip some lints, such as
  const {usfm, lintErrors} = parseUSFMChapter(newUsfm, "GEN");
  console.log("lintErrors", lintErrors);
  console.timeEnd("lint all via parse core");
  //   const parseTokens = editorState.read(() => {
  //     const root = $getRoot();
  //     return root
  //       .getAllTextNodes()
  //       .filter((node) => $isUSFMTextNode(node))
  //       .map((node) => node.exportJSON());
  //   });
  //   const ctx = initBaseTokenContext(parseTokens, {});
  //   lint(ctx);
}

export function ensurePlainTextNodeAlwaysFollowsVerseRange({
  editorState,
  editor,
}: LintVersesArgs) {
  const updates: Array<() => void> = [];
  editorState.read(() => {
    const root = $getRoot();
    root.getAllTextNodes().forEach((node) => {
      if (!$isVerseRangeTextNode(node)) return;
      const next = node.getNextSibling();
      if (
        !next ||
        !$isUSFMTextNode(next) ||
        next.getTokenType() !== UsfmTokenTypes.text
      ) {
        updates.push(() => {
          const emptySibling = $createUSFMTextNode(" ", {
            id: guidGenerator(),
            sid: node.getSid().trim(),
            inPara: node.getInPara(),
            tokenType: UsfmTokenTypes.text,
          });
          node.insertAfter(emptySibling);
        });
      }
    });
  });
  editor.update(
    () => {
      updates.forEach((update) => {
        update();
      });
    },
    {
      skipTransforms: true,
      tag: [HISTORY_MERGE_TAG],
    }
  );
}
export function ensureVerseRangeAlwaysFollowsVerseMarker({
  editorState,
  editor,
}: LintVersesArgs) {
  const updates: Array<() => void> = [];
  editorState.read(() => {
    const root = $getRoot();
    root.getAllTextNodes().forEach((node) => {
      if (!$isUSFMTextNode(node)) return;
      const hasVerseMarker = node.getMarker() === "v";
      if (!hasVerseMarker) return;
      const next = node.getNextSibling();
      if ($isVerseRangeTextNode(next)) return;
      updates.push(() => {
        const emptySibling = $createUSFMTextNode(" ", {
          id: guidGenerator(),
          sid: node.getSid().trim(),
          inPara: node.getInPara(),
          tokenType: UsfmTokenTypes.numberRange,
        });
        node.insertAfter(emptySibling);
      });
    });
  });
  editor.update(
    () => {
      const selection = $getSelection();
      updates.forEach((update) => {
        update();
      });
    },
    {
      skipTransforms: true,
      tag: [HISTORY_MERGE_TAG],
    }
  );
}

type VerseRangeLintArg = {
  allVerseRanges: {
    node: USFMTextNode;
    reference: ParsedReference;
    sid: string;
  }[];
  classNameTracker: {
    [nodeKey: string]: {node: USFMTextNode; classNames: LintVerseCn[]};
  };
};

function determineOutOfOrder({
  allVerseRanges,
  classNameTracker,
}: VerseRangeLintArg) {
  for (let i = 0; i < allVerseRanges.length; i++) {
    const {node} = allVerseRanges[i];
    const start = parseStart(node.getTextContent().trim());

    // First node: should usually start at 1 (adjust if you want a different rule)
    if (i === 0 && !Number.isNaN(start) && start !== 1) {
      const existing = classNameTracker[node.getKey()] ?? {
        node,
        classNames: [],
      };
      existing.classNames.push(lintMessages.vrOutOfOrder);
      classNameTracker[node.getKey()] = existing;
    }

    // Compare this node to the next node; mark THIS node if it jumps ahead.
    const next = allVerseRanges[i + 1];
    if (next) {
      const nextStart = parseStart(next.node.getTextContent().trim());
      if (
        !Number.isNaN(start) &&
        !Number.isNaN(nextStart) &&
        start > nextStart
      ) {
        const existing = classNameTracker[node.getKey()] ?? {
          node,
          classNames: [],
        };
        existing.classNames.push(lintMessages.vrOutOfOrder);
        classNameTracker[node.getKey()] = existing;
      }
    } else {
      // if not a next, assuem last, and make sure it's +1 of prev
      const prev = allVerseRanges[i - 1];
      if (prev) {
        const prevStart = parseStart(prev.node.getTextContent().trim());
        if (!Number.isNaN(prevStart) && start !== prevStart + 1) {
          const existing = classNameTracker[node.getKey()] ?? {
            node,
            classNames: [],
          };
          existing.classNames.push(lintMessages.vrOutOfOrder);
          classNameTracker[node.getKey()] = existing;
        }
      }
    }
  }
}

function determineDuplicate({
  allVerseRanges,
  classNameTracker,
}: VerseRangeLintArg) {
  type MapType = {
    nodes: USFMTextNode[];
    pendingSid: string;
  };
  const seen = new Map<string, MapType>();
  for (const {node, sid} of allVerseRanges) {
    const key = sid;
    const group = seen.get(key) ?? {
      nodes: [],
      pendingSid: sid,
    };
    group.nodes.push(node);
    seen.set(key, group);
  }

  // Mark duplicates
  for (const [_, group] of seen) {
    const isDuplicate = group.nodes.length > 1;
    const {pendingSid, nodes} = group;
    for (const dupNode of nodes) {
      const existing = classNameTracker[dupNode.getKey()] ?? {
        node: dupNode,
        pendingSid,
        classNames: [],
      };
      if (isDuplicate) existing.classNames.push(lintMessages.vrDuplicate);
      classNameTracker[dupNode.getKey()] = existing;
      // domEl.classList.toggle("verseRangeDuplicate", isDuplicate);
    }
  }
}

// Helper: parse a verse reference into a numeric start for ordering
function parseStart(verseText: string): number {
  const m = verseText.match(/^(\d+)/);
  return m ? Number(m[1]) : NaN;
}
