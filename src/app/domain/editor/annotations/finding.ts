// finding.ts
//
// The source-agnostic findings spine: one pure-data `Finding` model that every
// producer (onion lint, sous-chef content analysis, future analyzers)
// normalizes into. A Finding carries NO closures and NO display strings — a
// pipeline can produce it, and a locale switch can't stale it. Behavior
// (actions, detail views) attaches at the React edge via the decorator
// registry (`decorators/decorateFinding.tsx`); the localized message is
// formatted there too (`formatFindingMessage.ts`).
//
// Anchors come in two shapes — the editor's two stable addresses:
//   - `token`   structural lint, pinned to a token-id (minted GUIDs).
//   - `content` a sub-token `(sid, Utf16Span)` range, resolved to DOM rects via
//               onion's vref_index segment map (sous-chef findings).
// Consumers switch exhaustively on `anchor.kind` and `source` — both unions
// are closed; a new arm is a deliberate type edit that lights up every site
// owing it a decision.

import type { ReactNode } from "react";

import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { Utf16Span } from "@/core/domain/usfm/vrefTypes.ts";

import type { LocalLintCode } from "./localLint/numberingRules.ts";

/** Where a finding lives in the editor. */
export type Anchor =
  | {
      kind: "token";
      /** The token-id (`data-id`) this finding is pinned to. */
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

/**
 * Generalizes onion's `issueType`: structure = USFM markup problems, content =
 * problems in the text itself. Verse/chapter numbers and chapter labels are
 * content too — local-lint's consistency checks live here; "consistency" is why
 * they aren't onion's, not a separate user-facing category. Labels stay
 * "USFM"/"Content".
 */
export type FindingCategory = "structure" | "content";

export type FindingSeverity = "error" | "warning" | "info";

type FindingBase = {
  /**
   * Deterministic identity, derived from canonical fields by the normalizer
   * (`normalizeFindings.ts`) — never minted fresh per pass. Message text and
   * fix payloads are deliberately excluded: both vary for reasons other than
   * identity (locale, surrounding content) and would churn ids. Stability is
   * load-bearing — it is what lets consumers diff by key instead of
   * repainting.
   */
  id: string;
  /** `LintCode` | sous `RuleId`, depending on `source`. */
  code: string;
  severity: FindingSeverity;
  category: FindingCategory;
  anchor: Anchor;
  /**
   * The token-ids this finding covers, for the hover zip. Token anchors carry
   * their own token(s); content anchors resolve theirs at draw time.
   */
  touchedTokenIds?: string[];
};

/**
 * The marching-sequence facts a local-lint message renders from — data only,
 * never part of identity (the anchor token-id is the address). `found` is the
 * number on the offending `\c`/`\v`; `previous` is the prior number in the
 * sequence, present only for codes that compare against one (gap, decrease).
 */
export type LocalLintParams = {
  found: number;
  previous?: number;
};

/**
 * Discriminated by producer. Each arm carries the producer payload that
 * decoration/formatting needs — data, not behavior (onion's `fix` rides along
 * so the default decorator can build the apply action; the raw engine
 * `message` on it is locale-independent fallback data for unknown codes).
 * local-lint is self-describing: its `code` selects the message and `params`
 * fills it, so no engine payload is needed.
 */
export type Finding =
  | (FindingBase & { source: "onion"; issue: LintIssue })
  | (FindingBase & {
      source: "sous-chef";
      /** sous confidence, when the rule scores; undefined for binary rules. */
      score?: number;
    })
  // local-lint splits by code family: the numbering rules carry marching
  // params; the project-wide `\cl` rule carries the off-dominant stem + the
  // project's dominant, for the message (and is the one local-lint code with a
  // fix — "Standardize across project…").
  | (FindingBase & {
      source: "local-lint";
      code: LocalLintCode;
      params: LocalLintParams;
    })
  | (FindingBase & {
      source: "local-lint";
      code: "inconsistent-chapter-label";
      label: string;
      dominant: string;
    });

/**
 * Chapter-bucketed findings — the store's per-book node shape. Chapter 0 is
 * front matter (everything before `\c 1`); 0 is an address, so chapter checks
 * use `== null`, never falsiness.
 */
export type FindingsByChapter = Record<number, Finding[]>;

export type FindingActionKind = "primary" | "default";

/**
 * A button rendered under a finding's message. `run` is parameterless: the
 * decorator that builds the action closes over whatever it needs (via the
 * capability context). The `id` is a stable handle for tests and future
 * command surfaces.
 */
export type FindingAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  kind?: FindingActionKind;
  run: () => void | Promise<void>;
};

/**
 * Optional "see more" — the closed set of richer-chrome slots. `inline`
 * renders arbitrary JSX caged inside the popover card's frame; `modal` opens
 * through the workspace modal outlet. New slots extend this union — a
 * deliberate, reviewed act.
 */
export type FindingDetails =
  | { mode: "inline"; render: () => ReactNode }
  | { mode: "modal"; open: () => void };

/**
 * A finding plus its React-edge decoration — what surfaces actually render.
 * `message` is localized at decoration time by the one shared formatter, so
 * every surface shows the same text and a locale switch re-formats on the
 * next render with no invalidation machinery.
 */
export type DecoratedFinding = {
  /** Mirror of `finding.id` — the render key. */
  id: string;
  finding: Finding;
  message: string;
  actions: FindingAction[];
  details?: FindingDetails;
};
