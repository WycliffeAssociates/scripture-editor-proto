import { $createLineBreakNode, type LexicalNode } from "lexical";

import {
  type EditorShape,
  type UsfmTokenType,
  UsfmTokenTypes,
} from "@/app/data/editor.ts";
import { $createUSFMNumberedMarkerNode } from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";
import { $createUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import {
  ALL_USFM_MARKERS,
  getClosingBehavior,
  isEnabledNumberedMarker,
} from "@/core/domain/usfm/onionMarkers.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

const USFM_MARKER_PATTERN =
  /(^|[\s\u00A0])\\[A-Za-z][A-Za-z0-9]*\*?(?=$|[\s\u00A0])/gmu;
const VALID_INSERTABLE_TOKEN_TYPES = new Set<UsfmTokenType>([
  UsfmTokenTypes.marker,
  UsfmTokenTypes.endMarker,
  UsfmTokenTypes.numberRange,
  UsfmTokenTypes.text,
  UsfmTokenTypes.error,
  UsfmTokenTypes.verticalWhitespace,
]);

export type ClipboardUsfmTokenParseResult =
  | { ok: true; tokens: Token[] }
  | { ok: false; reason: "parse-failed" };

/**
 * Helpers for the "paste raw USFM into the editor" path.
 *
 * Normal typing operates on existing editor nodes. Paste is trickier because the
 * clipboard may contain raw USFM markup that needs to be parsed into token space
 * and then turned back into insertable Lexical nodes without corrupting the
 * current workspace structure.
 */
export function isUsfmLikePaste(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.length) return false;
  // The regex only EXTRACTS candidate \name tokens; classification is
  // catalog membership — onion's marker set, not a marker-shaped guess.
  // A single unknown backslash-word (a path, a TeX fragment) stays plain
  // text; any known marker routes the paste through the parser.
  const candidates = [...trimmed.matchAll(USFM_MARKER_PATTERN)].map((m) =>
    m[0].trim().replace(/^\\/u, "").replace(/\*$/u, ""),
  );
  return candidates.some((marker) => ALL_USFM_MARKERS.has(marker));
}

const PASTE_EDITOR_TYPE_BY_ONION_KIND = {
  newline: UsfmTokenTypes.verticalWhitespace,
  optBreak: UsfmTokenTypes.text,
  marker: UsfmTokenTypes.marker,
  endMarker: UsfmTokenTypes.endMarker,
  milestone: UsfmTokenTypes.milestone,
  milestoneEnd: UsfmTokenTypes.milestoneEnd,
  bookCode: UsfmTokenTypes.text,
  number: UsfmTokenTypes.numberRange,
  text: UsfmTokenTypes.text,
} as const satisfies Record<Token["kind"], UsfmTokenType>;

function onionKindToLexicalTokenType(kind: Token["kind"]): UsfmTokenType {
  return PASTE_EDITOR_TYPE_BY_ONION_KIND[kind];
}

export function parseClipboardUsfmToTokens(args: {
  text: string;
  bookCode: string;
  direction: LanguageDirection;
  usfmOnionService: IUsfmOnionService;
}): Promise<ClipboardUsfmTokenParseResult> {
  return parseClipboardUsfmToTokensAsync(args);
}

async function parseClipboardUsfmToTokensAsync(args: {
  text: string;
  bookCode: string;
  direction: LanguageDirection;
  usfmOnionService: IUsfmOnionService;
}): Promise<ClipboardUsfmTokenParseResult> {
  try {
    const projected = await args.usfmOnionService.parseUsfm(args.text, {
      lintOptions: null,
    });
    const hasInsertableTokens = projected.tokens.some((token) =>
      VALID_INSERTABLE_TOKEN_TYPES.has(onionKindToLexicalTokenType(token.kind)),
    );
    if (!hasInsertableTokens) {
      return { ok: false, reason: "parse-failed" };
    }

    return { ok: true, tokens: projected.tokens };
  } catch (error) {
    console.error("Error parsing USFM:", error);
    return { ok: false, reason: "parse-failed" };
  }
}

/**
 * Convert parsed USFM tokens into nodes that can be inserted into the current
 * Lexical editor selection.
 *
 * Every node gets a FRESH id: the clipboard parse mints the same
 * deterministic id scheme the original load used, so reusing them would
 * duplicate finding anchors already present in the document.
 *
 * In the regular shape, marker+number pairs become numbered-marker nodes —
 * the same pairing rule as the load waist (adjacent pair → one node;
 * unpaired enabled marker → empty-content node), applied to live nodes.
 * Flat shapes keep flat tokens: markers are visible editable bytes there.
 */
export function parsedUsfmTokensToInsertableNodes(
  tokens: Token[],
  shape: EditorShape = "regular",
): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const tokenType = onionKindToLexicalTokenType(token.kind);
    if (!VALID_INSERTABLE_TOKEN_TYPES.has(tokenType)) {
      continue;
    }

    if (tokenType === UsfmTokenTypes.verticalWhitespace) {
      nodes.push($createLineBreakNode());
      continue;
    }

    if (
      shape === "regular" &&
      tokenType === UsfmTokenTypes.marker &&
      token.marker &&
      isEnabledNumberedMarker(token.marker)
    ) {
      const next = tokens[i + 1];
      const isNumber = next?.kind === "number";
      let closeBytes: string | null = null;
      if (
        isNumber &&
        getClosingBehavior(token.marker) === "requiredExplicit" &&
        tokens[i + 2]?.kind === "endMarker" &&
        tokens[i + 2]?.marker === token.marker
      ) {
        closeBytes = tokens[i + 2].source;
      }
      nodes.push(
        $createUSFMNumberedMarkerNode(isNumber ? next.source : "", {
          numberId: guidGenerator(),
          openId: guidGenerator(),
          closeId: closeBytes ? guidGenerator() : null,
          openBytes: token.source,
          closeBytes,
          marker: token.marker,
          sid: token.sid || "",
          inPara: "",
        }),
      );
      if (isNumber) i += closeBytes != null ? 2 : 1;
      continue;
    }

    nodes.push(
      $createUSFMTextNode(token.source, {
        id: guidGenerator(),
        sid: token.sid || "",
        tokenType,
        marker: token.marker,
        inPara: "",
      }),
    );
  }
  return nodes;
}
