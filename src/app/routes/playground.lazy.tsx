import {
    type InitialConfigType,
    LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { createLazyFileRoute } from "@tanstack/react-router";
import {
    $create,
    $createLineBreakNode,
    $createParagraphNode,
    $getRoot,
    $getSelection,
    $isLineBreakNode,
    $isRangeSelection,
    COMMAND_PRIORITY_CRITICAL,
    COMMAND_PRIORITY_LOW,
    type EditorState,
    FORMAT_TEXT_COMMAND,
    INSERT_LINE_BREAK_COMMAND,
    INSERT_PARAGRAPH_COMMAND,
    type LexicalNode,
    LineBreakNode,
    ParagraphNode,
    TextNode,
} from "lexical";
import { useEffect, useState } from "react";
import {
    $createUSFMNumberedMarkerNode,
    $isUSFMNumberedMarkerNode,
    registerNumberedMarkerBehaviors,
    USFMNumberedMarkerNode,
} from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

/**
 * PROTOTYPE — numbered-marker node playground.
 *
 * Throwaway harness for the regular-mode structured-nodes plan
 * (agent-tmp/plans/regular-mode-structured-nodes/plan.md §5.2/§5.3): a tiny
 * editor with hand-built USFMNumberedMarkerNodes and NO loader/serializer —
 * the byte readout below is a playground-local mirror of the future waist
 * branch. The node class itself is real (nodes/USFMNumberedMarkerNode.tsx);
 * this route only answers feel questions: caret traversal, two-stage delete,
 * empty-node re-entry, empty-state visuals.
 *
 * Delete this route content when those questions are answered.
 */
export const Route = createLazyFileRoute("/playground")({
    component: PlaygroundRoute,
});

const PLAYGROUND_CSS = `
#numbered-playground { display: flex; gap: 16px; padding: 16px; font-family: system-ui, sans-serif; height: 100%; box-sizing: border-box; }
#numbered-playground .pg-editor-wrap { flex: 1.2; position: relative; display: flex; }
#numbered-playground .pg-editor { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 16px; font-size: 16px; line-height: 1.7; white-space: pre-wrap; outline: none; overflow: auto; }

/* Custom caret overlay — painted indicator, never intercepts input */
#numbered-playground .pg-caret { position: absolute; pointer-events: none; z-index: 5; background: #2563eb; }
#numbered-playground .pg-caret-bar { border-radius: 2px; box-shadow: 0 0 6px rgba(37, 99, 235, 0.6); }
#numbered-playground .pg-caret-underline { border-radius: 2px; animation: pg-caret-pulse 1.2s ease-in-out infinite; }
#numbered-playground .pg-caret-block { background: rgba(37, 99, 235, 0.25); border-radius: 3px; }
@keyframes pg-caret-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { #numbered-playground .pg-caret-underline { animation: none; } }

/* ...and ghost-level alongside a custom caret — the caret carries the
   signal, the tint whispers the extent of what you're editing. */
#numbered-playground:not([data-caret-variant="native"]) [data-token-type="numberedMarker"][data-caret-inside="true"] { background: rgba(37, 99, 235, 0.06); box-shadow: none; }

#numbered-playground .pg-variants { display: flex; gap: 6px; }
#numbered-playground .pg-variants button { font-size: 11px; padding: 3px 10px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; }
#numbered-playground .pg-variants button[data-active="true"] { background: #2563eb; color: #fff; border-color: #2563eb; }
#numbered-playground .pg-side { flex: 1; display: flex; flex-direction: column; gap: 12px; overflow: auto; font-size: 12px; }
#numbered-playground .pg-panel { border: 1px solid #ddd; border-radius: 6px; padding: 10px; }
#numbered-playground .pg-panel h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
#numbered-playground pre { margin: 0; white-space: pre-wrap; word-break: break-all; font-size: 11px; }
#numbered-playground table { border-collapse: collapse; width: 100%; }
#numbered-playground td, #numbered-playground th { border: 1px solid #eee; padding: 2px 6px; text-align: left; font-size: 11px; vertical-align: top; }
#numbered-playground .pg-checklist li { margin-bottom: 4px; }

/* Numbered-marker rendering — verse chip look, chapter big */
#numbered-playground [data-token-type="numberedMarker"] { color: #2563eb; font-weight: 700; font-size: 0.72em; vertical-align: super; letter-spacing: 0.02em; }

/* Native-caret color follows the MODEL (data-caret-in-number on the root,
   set by CaretInsideIndicatorPlugin), not DOM containment — a caret-colored
   lie is worse than no affordance. caret-color inherits, so the root attr
   covers wherever the browser physically renders the caret.

   The default is set EXPLICITLY (currentColor, not auto): Chrome's caret
   repaint on rule-set changes is unreliable with auto, retaining the last
   painted color after leaving a number. currentColor (not a hardcoded
   black) keeps it theme-proof — it tracks the text color in light/dark. */
#numbered-playground .pg-editor { caret-color: currentColor; }
#numbered-playground .pg-editor[data-caret-in-number="true"] { caret-color: #2563eb; }
#numbered-playground:not([data-caret-variant="native"]) .pg-editor[data-caret-in-number="true"] { caret-color: transparent; }

/* Chip tint at full strength for the native variant... */
#numbered-playground [data-token-type="numberedMarker"][data-caret-inside="true"] { background: rgba(37, 99, 235, 0.12); border-radius: 3px; box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.25); }
#numbered-playground [data-token-type="numberedMarker"][data-marker="c"] { font-size: 1.8em; vertical-align: baseline; color: #111; font-weight: 800; padding-right: 0.25ch; }
#numbered-playground [data-token-type="numberedMarker"][data-marker="vp"] { color: #7c3aed; }

/* Empty-node candidate treatment (§12 Q1): dashed slot + padding so the
   zero-width node has a visible, clickable footprint. */
#numbered-playground [data-token-type="numberedMarker"][data-empty="true"] { outline: 2px dashed #dc2626; padding: 0 0.6ch; margin: 0 1px; }
`;

/** Deterministic ids so the readout table is stable and legible. */
let idCounter = 0;
function tid(label: string): string {
    return `${label}-${idCounter++}`;
}

function makeVerse(
    marker: string,
    openBytes: string,
    numberText: string,
    closeBytes: string | null = null,
): USFMNumberedMarkerNode {
    const label = `${marker}${numberText.trim() || "empty"}`;
    return $createUSFMNumberedMarkerNode(numberText, {
        numberId: tid(`num-${label}`),
        openId: tid(`open-${label}`),
        closeId: closeBytes ? tid(`close-${label}`) : null,
        openBytes,
        closeBytes,
        marker,
        sid: "",
        inPara: "p",
    });
}

function makeText(text: string): USFMTextNode {
    return $createUSFMTextNode(text, {
        id: tid("text"),
        sid: "",
        inPara: "p",
        tokenType: "text",
    });
}

function makeParaContainer(marker: string, markerText: string) {
    const node = $create(USFMParagraphNode);
    node.setId(tid(`para-${marker}`))
        .setMarker(marker)
        .setMarkerText(markerText)
        .setTokenType("marker");
    return node;
}

/**
 * Hand-built fixture: the worked-case content from the plan's §5.3, plus the
 * named bad states (junk whitespace, empty/unpaired verse, closed \vp pair).
 */
function $buildFixtureState() {
    const root = $getRoot();
    root.clear();

    // Chapter line: \c 1\n — default ParagraphNode is the chapter container.
    const chapterPara = $createParagraphNode();
    chapterPara.append(makeVerse("c", "\\c ", "1"), $createLineBreakNode());

    // \p container with verses.
    const p = makeParaContainer("p", "\\p\n");
    p.append(
        makeVerse("v", "\\v ", "1 "),
        makeText("In the beginning God created the heavens and the earth. "),
        // \v and \vp directly adjacent — the realistic published-verse shape
        // (\v 2 \vp 2b\vp* text…) and the blue↔blue boundary case.
        makeVerse("v", "\\v ", "2 "),
        makeVerse("vp", "\\vp ", "2b", "\\vp*"),
        makeText(
            " And the earth was without form and void; darkness was upon the face of the deep. ",
        ),
        $createLineBreakNode(),
        makeVerse("v", "\\v ", "3 "),
        makeText("And God said, Let there be light: and there was light. "),
        makeVerse("v", "\\v ", "   4 "),
        makeText("This verse number carries junk leading whitespace. "),
        $createLineBreakNode(),
        makeVerse("v", "\\v ", ""),
        makeText("This verse arrived with no number (unpaired marker). "),
    );

    root.append(chapterPara, p);
}

type NodeRow = {
    key: string;
    kind: string;
    marker: string;
    bytes: string;
    /** Token id — surfaces the paste-duplicates-ids problem in the table. */
    tokenId?: string;
};

/**
 * Playground-local emission mirror — what the real
 * materializeFlatTokensFromSerialized branch will produce per node. Keyed on
 * node class, exactly like the real waist.
 */
function describeNode(node: LexicalNode): NodeRow {
    if ($isUSFMNumberedMarkerNode(node)) {
        return {
            key: node.getKey(),
            kind:
                node.getTextContent() === "" ? "numbered (EMPTY)" : "numbered",
            marker: node.getMarker() ?? "",
            bytes: node.getUsfmBytes(),
            tokenId: node.getId(),
        };
    }
    if ($isUSFMTextNode(node)) {
        return {
            key: node.getKey(),
            kind: "text",
            marker: "",
            bytes: node.getTextContent(),
            tokenId: node.getId(),
        };
    }
    if ($isLineBreakNode(node)) {
        return {
            key: node.getKey(),
            kind: "linebreak",
            marker: "",
            bytes: "\n",
        };
    }
    return { key: node.getKey(), kind: node.getType(), marker: "", bytes: "" };
}

type Readout = {
    rows: NodeRow[];
    bytes: string;
    selection: string;
};

function ReadoutPlugin({ onReadout }: { onReadout: (r: Readout) => void }) {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const rows: NodeRow[] = [];
                let bytes = "";
                for (const block of $getRoot().getChildren()) {
                    if (block instanceof USFMParagraphNode) {
                        const markerText = block.getMarkerText() ?? "";
                        rows.push({
                            key: block.getKey(),
                            kind: "para-container",
                            marker: block.getMarker() ?? "",
                            bytes: markerText,
                        });
                        bytes += markerText;
                    }
                    const children =
                        block instanceof ParagraphNode ||
                        block instanceof USFMParagraphNode
                            ? block.getChildren()
                            : [];
                    for (const child of children) {
                        const row = describeNode(child);
                        rows.push(row);
                        bytes += row.bytes;
                    }
                }

                let selection = "none";
                const sel = $getSelection();
                if ($isRangeSelection(sel)) {
                    const a = sel.anchor;
                    const f = sel.focus;
                    selection = `anchor ${a.getNode().getType()}#${a.key}@${a.offset} → focus ${f.getNode().getType()}#${f.key}@${f.offset}${sel.isCollapsed() ? " (collapsed)" : ""}`;
                }
                onReadout({ rows, bytes, selection });
            });
        });
    }, [editor, onReadout]);
    return null;
}

/**
 * Caret-inside indicator (playground experiment): mirrors the collapsed
 * caret's owning numbered node onto a data attribute so CSS can tint the
 * chip. Imperative DOM write — re-applied per selection change, cleared on
 * the previous node.
 */
function CaretInsideIndicatorPlugin() {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        // Sentinel forces the first apply to write attributes
        // unconditionally — after an HMR remount the tracked key resets but
        // stale DOM attributes survive, leaving caret color lying until the
        // next number entry/exit.
        let prevKey: string | null | "__init__" = "__init__";
        const apply = (editorState: EditorState) => {
            const nextKey = editorState.read(() => {
                const sel = $getSelection();
                if (!$isRangeSelection(sel) || !sel.isCollapsed()) return null;
                const node = sel.anchor.getNode();
                return $isUSFMNumberedMarkerNode(node) ? node.getKey() : null;
            });
            const root = editor.getRootElement();
            if (nextKey === prevKey) return;
            if (prevKey === "__init__") {
                // Stale-attr sweep: we don't know which (possibly pre-HMR)
                // element still carries the marker.
                root?.querySelectorAll("[data-caret-inside]").forEach((el) => {
                    el.removeAttribute("data-caret-inside");
                });
            } else if (prevKey) {
                editor
                    .getElementByKey(prevKey)
                    ?.removeAttribute("data-caret-inside");
            }
            if (nextKey) {
                editor
                    .getElementByKey(nextKey)
                    ?.setAttribute("data-caret-inside", "true");
            }
            // Root-level mirror of the MODEL position — native-caret color
            // keys off this, not off which DOM node happens to hold the
            // caret (those can disagree: canonicalized clicks, empty nodes
            // whose caret renders outside the span).
            if (nextKey) {
                root?.setAttribute("data-caret-in-number", "true");
            } else {
                root?.removeAttribute("data-caret-in-number");
            }
            prevKey = nextKey;
        };
        apply(editor.getEditorState());
        return editor.registerUpdateListener(({ editorState }) =>
            apply(editorState),
        );
    }, [editor]);
    return null;
}

/** Registers the real numbered-marker behaviors + playground-only format swallow. */
function NumberedMarkerGuardsPlugin() {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        const unregisterBehaviors = registerNumberedMarkerBehaviors(editor);
        // Numbered nodes refuse splitText; formatText would index into a
        // split result. The scripture editor has no text-format commands —
        // swallow them here too.
        const unregisterFormat = editor.registerCommand(
            FORMAT_TEXT_COMMAND,
            () => true,
            COMMAND_PRIORITY_CRITICAL,
        );
        // Playground-local Enter policy: USFMParagraphNode has no
        // insertNewAfter, so the default paragraph split is a silent no-op.
        // Map Enter to a linebreak (a "\n" byte) — the §5.3-expected
        // behavior; the real editor owns its own Enter semantics.
        const unregisterEnter = editor.registerCommand(
            INSERT_PARAGRAPH_COMMAND,
            () => {
                editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
                return true;
            },
            COMMAND_PRIORITY_LOW,
        );
        return () => {
            unregisterBehaviors();
            unregisterFormat();
            unregisterEnter();
        };
    }, [editor]);
    return null;
}

function getInitialConfig(): InitialConfigType {
    return {
        namespace: "USFMEditor-Playground",
        editorState: $buildFixtureState,
        nodes: [
            USFMParagraphNode,
            USFMTextNode,
            USFMNumberedMarkerNode,
            {
                replace: TextNode,
                with: (node: TextNode) =>
                    $createUSFMTextNode(node.getTextContent(), {
                        id: guidGenerator(),
                        sid: "",
                        inPara: "",
                    }),
                withKlass: USFMTextNode,
            },
            ParagraphNode,
            LineBreakNode,
        ],
        onError: console.error,
    };
}

const CHECKLIST = [
    "Arrow through a verse number — TWO stops per boundary, same visual spot; caret + chip turn blue when the number owns the caret",
    "At the boundary before a number (blue chip on), type a digit — number grows leftward (2 → 12)",
    "Click before a number, Backspace — deletes the previous linebreak (default)",
    "Select a digit, type another — renumbers in place, stays blue",
    "Backspace the last digit — node EMPTIES (dashed slot), caret stays inside",
    "Type a digit into the empty slot — renders as a number immediately",
    "Backspace again on the empty node — node removed whole (bytes lose \\v )",
    "Arrow-key into an empty node — caret can land inside it",
    "Range-delete from mid-text into a number — number survives partial/empty",
    "Select across a whole visible number + delete — node removed whole",
    "Undo after two-stage delete — node restored whole in one step",
    "Junk-whitespace verse (   4) — whitespace visible, editable, preserved in bytes",
    "Type x into a number — accepted (transient bad state, bytes show \\v x)",
    "Enter mid-text — inserts a linebreak (\\n byte appears in readout)",
    "Enter at the blue @0 stop — linebreak lands BEFORE the whole verse node",
    "Enter inside a number — no split corruption (observe where the break lands)",
    "Adjacent \\v 2 + \\vp 2b — double stops at the blue↔blue boundary; each edits its own number",
    "Copy a range across a verse number, paste at end — node round-trips whole; NOTE the id column duplicates (real code must re-mint ids on paste)",
    "Type space at end of number content — caret jumps to following text, no extra space byte",
];

type CaretVariant = "native" | "bar" | "underline" | "block";

type CaretBox = {
    left: number;
    top: number;
    width: number;
    height: number;
    isEmptyNode: boolean;
};

/**
 * Custom caret experiment: when the collapsed caret sits inside a numbered
 * node, hide the native caret (CSS, via data-caret-variant on the container)
 * and paint our own indicator — any size, any animation, none of the native
 * caret's constraints. Pure presentation overlay: reads selection, never
 * writes it. Native caret everywhere else.
 */
function CustomCaretPlugin({ variant }: { variant: CaretVariant }) {
    const [editor] = useLexicalComposerContext();
    const [box, setBox] = useState<CaretBox | null>(null);

    useEffect(() => {
        if (variant === "native") {
            setBox(null);
            return;
        }
        const repaint = () => {
            editor.getEditorState().read(() => {
                const root = editor.getRootElement();
                const wrap = root?.parentElement;
                const sel = $getSelection();
                if (
                    !root ||
                    !wrap ||
                    document.activeElement !== root || // native carets hide on blur; so do we
                    !$isRangeSelection(sel) ||
                    !sel.isCollapsed()
                ) {
                    setBox(null);
                    return;
                }
                const node = sel.anchor.getNode();
                if (!$isUSFMNumberedMarkerNode(node)) {
                    setBox(null);
                    return;
                }
                const span = editor.getElementByKey(node.getKey());
                const textDom = span?.firstChild;
                if (!span) {
                    setBox(null);
                    return;
                }
                const wrapRect = wrap.getBoundingClientRect();
                const offset = sel.anchor.offset;
                const size = node.getTextContentSize();

                // Character-cell rect strategy (collapsed-range rects are
                // unreliable at boundaries): measure the cell after the
                // caret, or before it at the node end; the padded span box
                // itself for the empty node.
                let cell: DOMRect;
                let atEnd = false;
                let isEmptyNode = false;
                if (size === 0 || textDom?.nodeType !== Node.TEXT_NODE) {
                    cell = span.getBoundingClientRect();
                    isEmptyNode = true;
                } else if (offset < size) {
                    const r = document.createRange();
                    r.setStart(textDom, offset);
                    r.setEnd(textDom, offset + 1);
                    cell = r.getBoundingClientRect();
                } else {
                    const r = document.createRange();
                    r.setStart(textDom, size - 1);
                    r.setEnd(textDom, size);
                    cell = r.getBoundingClientRect();
                    atEnd = true;
                }
                setBox({
                    left: (atEnd ? cell.right : cell.left) - wrapRect.left,
                    top: cell.top - wrapRect.top,
                    width: isEmptyNode ? cell.width : atEnd ? 0 : cell.width,
                    height: cell.height,
                    isEmptyNode,
                });
            });
        };
        const unregister = editor.registerUpdateListener(repaint);
        const rootEl = editor.getRootElement();
        rootEl?.addEventListener("scroll", repaint);
        rootEl?.addEventListener("focus", repaint);
        rootEl?.addEventListener("blur", repaint);
        window.addEventListener("resize", repaint);
        repaint();
        return () => {
            unregister();
            rootEl?.removeEventListener("scroll", repaint);
            rootEl?.removeEventListener("focus", repaint);
            rootEl?.removeEventListener("blur", repaint);
            window.removeEventListener("resize", repaint);
        };
    }, [editor, variant]);

    if (!box || variant === "native") return null;

    // Fallback cell width when the caret has no following character to
    // measure (node end).
    const cellWidth = box.width || 9;
    let style: React.CSSProperties;
    if (variant === "bar") {
        // In the empty slot the bar stays a bar, centered — the dashed
        // outline is the slot affordance; the caret shouldn't become a blob.
        const x = box.isEmptyNode ? box.left + box.width / 2 : box.left;
        style = {
            left: x - 1.5,
            top: box.top - 3,
            width: 3,
            height: box.height + 6,
        };
    } else if (variant === "underline") {
        style = {
            left: box.left,
            top: box.top + box.height,
            width: box.isEmptyNode ? box.width : cellWidth,
            height: 3,
        };
    } else {
        // block — in the empty node it fills the slot; that's the point.
        style = box.isEmptyNode
            ? {
                  left: box.left,
                  top: box.top,
                  width: box.width,
                  height: box.height,
              }
            : {
                  left: box.left,
                  top: box.top - 1,
                  width: cellWidth,
                  height: box.height + 2,
              };
    }
    return <div className={`pg-caret pg-caret-${variant}`} style={style} />;
}

const CARET_VARIANTS: CaretVariant[] = ["bar", "underline", "block", "native"];

export function PlaygroundRoute() {
    const [readout, setReadout] = useState<Readout>({
        rows: [],
        bytes: "",
        selection: "none",
    });
    const [caretVariant, setCaretVariant] = useState<CaretVariant>("bar");

    return (
        // biome-ignore lint/correctness/useUniqueElementIds: throwaway prototype route, mounted once
        <div id="numbered-playground" data-caret-variant={caretVariant}>
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: throwaway prototype-local stylesheet */}
            <style dangerouslySetInnerHTML={{ __html: PLAYGROUND_CSS }} />
            <LexicalComposer initialConfig={getInitialConfig()}>
                <div className="pg-editor-wrap">
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                className="pg-editor"
                                aria-label="Numbered marker playground"
                                spellCheck={false}
                            />
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <CustomCaretPlugin variant={caretVariant} />
                </div>
                <HistoryPlugin />
                <NumberedMarkerGuardsPlugin />
                <CaretInsideIndicatorPlugin />
                <ReadoutPlugin onReadout={setReadout} />
            </LexicalComposer>
            <div className="pg-side">
                <div className="pg-panel">
                    <h3>Caret variant (inside numbers)</h3>
                    <div className="pg-variants">
                        {CARET_VARIANTS.map((v) => (
                            <button
                                key={v}
                                type="button"
                                data-active={v === caretVariant}
                                onClick={() => setCaretVariant(v)}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="pg-panel">
                    <h3>Selection</h3>
                    <pre>{readout.selection}</pre>
                </div>
                <div className="pg-panel">
                    <h3>Serialized bytes (playground-local emission)</h3>
                    <pre>{JSON.stringify(readout.bytes)}</pre>
                </div>
                <div className="pg-panel">
                    <h3>Nodes</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>kind</th>
                                <th>marker</th>
                                <th>bytes (JSON)</th>
                                <th>id</th>
                            </tr>
                        </thead>
                        <tbody>
                            {readout.rows.map((row) => (
                                <tr key={row.key}>
                                    <td>{row.kind}</td>
                                    <td>{row.marker}</td>
                                    <td>{JSON.stringify(row.bytes)}</td>
                                    <td>{row.tokenId}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="pg-panel">
                    <h3>Test script (§5.3 lifecycle)</h3>
                    <ol className="pg-checklist">
                        {CHECKLIST.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ol>
                </div>
            </div>
        </div>
    );
}
