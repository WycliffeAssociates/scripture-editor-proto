// editorAnnotation.ts
//
// The source-agnostic "findings" spine. onion lint issues, sous-chef content
// findings, and app heuristics all normalize into one `EditorAnnotation` shape
// — `message + actions[]` — so a single dumb popover can render them. A
// `(source, code) -> provider` registry produces them (see
// `onionAnnotationProvider.tsx` for the first, default producer).
//
// Anchors come in two shapes (Phase 3 added `content`):
//   - `token`   structural lint, pinned to a token-id (onion).
//   - `content` a sub-token `(sid, Utf16Span)` range, resolved to DOM rects via
//               onion's vref_index segment map (sous-chef findings).
// The registry/popover above don't care which.

import type { ReactNode } from "react";
import type { Utf16Span } from "@/core/domain/usfm/vrefTypes.ts";

/** Where an annotation lives in the editor. */
export type Anchor =
    | {
          kind: "token";
          /** The token-id (`data-id`) this annotation is pinned to. */
          tokenId: string;
          /** Verse/segment id, when the source carries one. */
          sid?: string;
      }
    | {
          kind: "content";
          /** Verse id whose projection the range addresses. */
          sid: string;
          /** UTF-16 range into that verse's projected text. */
          range: Utf16Span;
      };

export type AnnotationActionKind = "primary" | "default";

/**
 * A button rendered under an annotation's message. `run` is parameterless: the
 * provider that builds the action closes over whatever it needs (the lint-fix
 * applier today). A future phase whose action needs editor/project context can
 * give `run` a parameter then — there is no consumer for it yet.
 */
export type AnnotationAction = {
    id: string;
    label: string;
    icon?: ReactNode;
    kind?: AnnotationActionKind;
    run: () => void | Promise<void>;
};

/**
 * Optional "see more" — the ONE escape hatch for richer chrome (evidence
 * panels, probability bars, future alignment UI) without the model knowing
 * about any of them. `render`/`open` are parameterless for the same reason
 * `AnnotationAction.run` is: the provider closes over what it needs.
 */
export type AnnotationDetails =
    | { mode: "inline"; render: () => ReactNode }
    | { mode: "modal"; open: () => void };

/**
 * The one shape everything anchored in the editor normalizes into. `severity`
 * keeps `"info"` available for sous-chef/app sources even though onion only
 * emits `"error" | "warning"`.
 */
export type EditorAnnotation = {
    id: string;
    source: "onion" | "sous-chef" | "app";
    /** `LintCode` | sous `rule_id` | app action id, depending on `source`. */
    code: string;
    severity: "error" | "warning" | "info";
    anchor: Anchor;
    message: string;
    /** sous-chef confidence → chip; undefined for onion. */
    score?: number;
    /** 0..n action buttons. */
    actions?: AnnotationAction[];
    /** Optional richer view (evidence panel, picker modal). */
    details?: AnnotationDetails;
    /**
     * The token-ids this annotation covers, for the hover zip. Filled by the
     * provider (token anchors → their one token) or at resolve time (content
     * anchors → the tokens the range falls into).
     */
    touchedTokenIds?: string[];
};
