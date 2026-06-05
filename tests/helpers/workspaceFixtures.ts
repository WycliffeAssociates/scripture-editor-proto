// workspaceFixtures.ts
//
// Test factories for the `WorkingFilesStore` + pipelines integration seam.
// Centralized so store-seam tests open with `describe`/`it`, not 30–60
// lines of per-file boilerplate rebuilding `ScriptureChapterState` /
// `ScriptureBookState` / patch shapes from scratch.
//
// Discipline: rule of three. A factory belongs here on the third
// independent definition or when the third new integration test would
// need it. Do not pre-add helpers for hypothetical callers.
//
// Layering: this module is one level *above* `usfmTokenBuilders.ts`,
// which builds individual SerializedLexicalNode tokens. The factories
// here build workspace-state values (chapters, books) and the
// `WorkingFilesPatch` / `CommitMeta` inputs to `WorkingFilesStore.commit`.
//
// Three caveats worth knowing before you reach for these:
//   1. `makeFlatRegularState` emits a plain `paragraph` node, not the
//      custom `usfm-paragraph-node`. Tests that exercise mode switching
//      or structural-fixup behavior need the custom-node shape and
//      should not use this helper for the editor state.
//   2. `makeChapter` defaults `sourceText === text` (clean). Pass a
//      different `sourceText` to make a dirty chapter without juggling
//      the `dirty` flag yourself.
//   3. `makeCommitMeta` returns `Omit<CommitMeta, "generation">`. The
//      store assigns `generation`; tests must not pre-set it.

import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { type EditorShape, UsfmTokenTypes } from "@/app/data/editor.ts";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { tokensToLexical } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { CommitMeta, WorkingFilesPatch } from "@/app/state/types.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

type CommitMetaInput = Omit<CommitMeta, "generation">;

type TokenIdent = { sid?: string; id?: string };

function identDefaults(opts: TokenIdent | undefined, fallbackId: string) {
    const sid = opts?.sid ?? "GEN 1:1";
    return { sid, id: opts?.id ?? `${sid}-${fallbackId}` };
}

/**
 * Single text-kind `Token` array (optionally led by a `\p` marker token so
 * shape-aware consumers have a paragraph-class block to build from).
 * Default sid `"GEN 1:1"`.
 *
 * @knipignore — part of the helper module's stable surface; kept
 * exported even when only used transitively via `makeChapter` so
 * future store-seam tests can compose `Token[]` directly without
 * re-deriving the shape.
 */
export function makeTokens(
    text: string,
    opts?: TokenIdent & { withParagraphMarker?: boolean },
): Token[] {
    const { sid, id } = identDefaults(opts, "text");
    const textToken = {
        id,
        kind: "text",
        span: { start: 0, end: text.length },
        sid,
        source: text,
    } as Token;
    if (!opts?.withParagraphMarker) return [textToken];
    return [
        {
            id: `${id}-p`,
            kind: "marker",
            marker: "p",
            span: { start: 0, end: 3 },
            sid,
            source: "\\p ",
        } as Token,
        {
            ...textToken,
            span: { start: 3, end: 3 + text.length },
        } as Token,
    ];
}

/**
 * Minimal `SerializedEditorState` containing one `paragraph` with one
 * USFM text node. Suitable for tests where the editor *tree shape*
 * isn't the contract under test. See caveat 1 in the file header.
 */
export function makeFlatRegularState(
    text: string,
    opts?: TokenIdent,
): SerializedEditorState<SerializedLexicalNode> {
    const { sid, id } = identDefaults(opts, "text");
    return {
        root: {
            type: "root",
            version: 1,
            direction: "ltr",
            format: "",
            indent: 0,
            children: [
                {
                    type: "paragraph",
                    version: 1,
                    direction: "ltr",
                    format: "",
                    indent: 0,
                    textFormat: 0,
                    textStyle: "",
                    children: [
                        createSerializedUSFMTextNode({
                            text,
                            sid,
                            id,
                            tokenType: UsfmTokenTypes.text,
                        }),
                    ],
                } as unknown as SerializedLexicalNode,
            ],
        },
    } as SerializedEditorState<SerializedLexicalNode>;
}

export type MakeChapterOptions = {
    bookCode?: string;
    chapterNumber?: number;
    /** Current (post-edit) text. Defaults to "Sample text.". */
    text?: string;
    /** Loaded-from-disk text. Defaults to `text` (clean chapter). */
    sourceText?: string;
    /**
     * Overrides the dirty flag. Default: derived from `sourceText !== text`
     * so the common cases ("clean" / "edited from source") need no extra
     * argument.
     */
    dirty?: boolean;
    /**
     * When set, materialize `lexicalState` through the production
     * `tokensToLexical` adapter in this tree shape (and the saved baseline
     * as flat) instead of the plain-paragraph `makeFlatRegularState` stub —
     * for tests where the tree shape IS the contract (resolves caveat 1).
     * Tokens get a leading `\p` marker so form/regular shapes have a
     * paragraph-class block to build from.
     */
    shape?: EditorShape;
};

export function makeChapter(
    opts: MakeChapterOptions = {},
): ScriptureChapterState {
    const bookCode = opts.bookCode ?? "GEN";
    const chapterNumber = opts.chapterNumber ?? 1;
    const text = opts.text ?? "Sample text.";
    const sourceText = opts.sourceText ?? text;
    const sid = `${bookCode} ${chapterNumber}:1`;
    const dirty = opts.dirty ?? sourceText !== text;
    const withParagraphMarker = opts.shape !== undefined;
    const sourceTokens = makeTokens(sourceText, {
        sid,
        id: `${sid}-source`,
        withParagraphMarker,
    });
    const currentTokens = makeTokens(text, {
        sid,
        id: `${sid}-current`,
        withParagraphMarker,
    });
    return {
        chapterNumber,
        dirty,
        eol: "\n",
        sourceTokens,
        currentTokens,
        loadedLexicalState: opts.shape
            ? tokensToLexical({
                  tokens: sourceTokens,
                  direction: "ltr",
                  mode: "flat",
              })
            : makeFlatRegularState(sourceText, {
                  sid,
                  id: `${sid}-source`,
              }),
        lexicalState: opts.shape
            ? tokensToLexical({
                  tokens: currentTokens,
                  direction: "ltr",
                  mode: opts.shape,
              })
            : makeFlatRegularState(text, {
                  sid,
                  id: `${sid}-current`,
              }),
    };
}

export type MakeBookOptions = {
    bookCode?: string;
    title?: string;
    path?: string;
    /** Defaults to a single clean chapter built by `makeChapter`. */
    chapters?: ScriptureChapterState[];
};

export function makeBook(opts: MakeBookOptions = {}): ScriptureBookState {
    const bookCode = opts.bookCode ?? "GEN";
    return {
        bookCode,
        title: opts.title ?? bookCode,
        path: opts.path ?? `/userData/projects/demo/${bookCode}.usfm`,
        nextBookId: null,
        prevBookId: null,
        chapters: opts.chapters ?? [makeChapter({ bookCode })],
    };
}

/** `kind: "chapter"` patch with a default lexical state built from `text`. */
export function makeChapterPatch(args: {
    bookCode: string;
    chapter: number;
    text: string;
}): WorkingFilesPatch {
    return {
        kind: "chapter",
        bookCode: args.bookCode,
        chapter: args.chapter,
        lexicalState: makeFlatRegularState(args.text, {
            sid: `${args.bookCode} ${args.chapter}:1`,
        }),
    };
}

/**
 * Build a `CommitMetaInput` for `WorkingFilesStore.commit`. `dirtyTextContent`
 * defaults to true for every kind except `metadataOnly`, matching the
 * bridge plugin's behavior.
 */
export function makeCommitMeta(args: {
    kind: CommitMeta["kind"];
    bookCode: string;
    chapter: number;
    dirtyTextContent?: boolean;
}): CommitMetaInput {
    return {
        kind: args.kind,
        scope: {
            chapters: [{ bookCode: args.bookCode, chapterNum: args.chapter }],
        },
        dirtyTextContent:
            args.dirtyTextContent ?? args.kind !== "metadataOnly",
    };
}
