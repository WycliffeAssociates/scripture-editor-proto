import {$dfs} from "@lexical/utils";
import {$getRoot, type LexicalEditor} from "lexical";
import {UsfmTokenTypes} from "@/app/data/editor";
import {
  $isUSFMTextNode,
  USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import {parseSid} from "@/core/data/bible/bible";

type LintVersesArgs = {
  editor: LexicalEditor;
  node: USFMTextNode;
};
export function lintVerseRangeReferences({editor, node}: LintVersesArgs) {
  const nodeTokenType = node.getTokenType();
  if (nodeTokenType !== UsfmTokenTypes.verseRange) return;
  const sid = node.getSid().trim();
  const classNames: {
    [nodeKey: string]: {
      node: USFMTextNode;
      classNames: string[];
    };
  } = {};

  // if the sid is chapter type of 1CO #, ignore. only verses;
  if (!parseSid(sid)) return;
  const root = $getRoot();
  const allVerseRanges = $dfs(root)
    .filter(
      (node) =>
        $isUSFMTextNode(node.node) &&
        node.node.getTokenType() === UsfmTokenTypes.verseRange &&
        parseSid(node.node.getSid().trim())
    )
    .map((node) => {
      return {
        node: node.node as USFMTextNode,
        key: node.node.getKey(),
        textContent: node.node.getTextContent().trim(),
      };
    });

  // check for dups and out of orders. If so, add className "verseRangeDuplicate" or "verseRangeOutOfOrder"

  // Mark duplicates
  determineDuplicate(allVerseRanges, classNames);

  // Check order (based on numeric start)
  determineOutOfOrder(allVerseRanges, classNames);
  const currentClassNames = new Set(node.getClassNames());
  Object.entries(classNames).forEach(([_, {node, classNames}]) => {
    [...new Set(classNames)].forEach((c) => {
      if (!currentClassNames.has(c)) {
        node.setClassName(c, true);
      }
    });
  });
}

function determineOutOfOrder(
  allVerseRanges: {node: USFMTextNode; textContent: string}[],
  classNames: {[nodeKey: string]: {node: USFMTextNode; classNames: string[]}}
) {
  for (let i = 0; i < allVerseRanges.length; i++) {
    const {node, textContent} = allVerseRanges[i];
    const start = parseStart(textContent);

    // First node: should usually start at 1 (adjust if you want a different rule)
    if (i === 0 && !Number.isNaN(start) && start !== 1) {
      const existing = classNames[node.getKey()] ?? {node, classNames: []};
      existing.classNames.push("verseRangeOutOfOrder");
      classNames[node.getKey()] = existing;
    }

    // Compare this node to the next node; mark THIS node if it jumps ahead.
    const next = allVerseRanges[i + 1];
    if (next) {
      const nextStart = parseStart(next.textContent);
      if (
        !Number.isNaN(start) &&
        !Number.isNaN(nextStart) &&
        start > nextStart
      ) {
        const existing = classNames[node.getKey()] ?? {node, classNames: []};
        existing.classNames.push("verseRangeOutOfOrder");
        classNames[node.getKey()] = existing;
      }
    }
  }
}

function determineDuplicate(
  allVerseRanges: {node: USFMTextNode; textContent: string}[],
  classNames: {[nodeKey: string]: {node: USFMTextNode; classNames: string[]}}
) {
  const seen = new Map<string, USFMTextNode[]>();
  for (const {node, textContent} of allVerseRanges) {
    const key = textContent;
    const group = seen.get(key) ?? [];
    group.push(node);
    seen.set(key, group);
  }

  // Mark duplicates
  for (const [, group] of seen) {
    const isDuplicate = group.length > 1;
    for (const dupNode of group) {
      const existing = classNames[dupNode.getKey()] ?? {
        node: dupNode,
        classNames: [],
      };
      if (isDuplicate) existing.classNames.push("verseRangeDuplicate");
      classNames[dupNode.getKey()] = existing;
      // domEl.classList.toggle("verseRangeDuplicate", isDuplicate);
    }
  }
}

// Helper: parse a verse reference into a numeric start for ordering
function parseStart(verseText: string): number {
  const m = verseText.match(/^(\d+)/);
  return m ? Number(m[1]) : NaN;
}
