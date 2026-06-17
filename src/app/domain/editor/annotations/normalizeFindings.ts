// normalizeFindings.ts
//
// Producer → `Finding` normalizers, one per source, plus the deterministic
// identity derivation. Normalization is pure data mapping: no localization
// (that's `formatFindingMessage`), no actions (that's the decorator registry).
//
// Identity recipe:
//
//     id = `${source}:${code}:${anchorKey}#${occurrence}`
//     token anchor:   anchorKey = `${tokenId}:${relatedTokenId ?? ""}`
//     content anchor: anchorKey = `${sid}:${range.start}:${range.end}`
//
// Excluded by design: message text and the fix payload. Both vary for reasons
// other than identity — message with locale, fix replacement text with
// surrounding content — and either would churn ids and force repaints of
// findings that didn't change. Token-anchor source spans are excluded for the
// same reason (byte offsets shift with unrelated edits earlier in the file);
// token ids are the stable address. NO id requirement is pushed into onion or
// sous — the editor derives ids from what the engines already return.
//
// Occurrence suffixes disambiguate twins (identical source+code+anchor) and
// are assigned AFTER a stable sort by the base key — a content-independent
// composite of exactly those fields — so the assignment is deterministic per
// pass regardless of engine output order. Twins are interchangeable, so which
// twin gets which suffix is unobservable; only determinism matters.

import { parseSid } from "@/core/data/bible/bible.ts";
import type { SousFinding } from "@/core/domain/sous/sousTypes.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

import type { Finding, FindingsByChapter } from "./finding.ts";
import {
  LOCAL_LINT_SEVERITY,
  type LocalLintIssue,
} from "./localLint/numberingRules.ts";

type ProtoFinding = {
  baseKey: string;
  build: (id: string) => Finding;
};

/**
 * Assign `#occurrence` suffixes deterministically and return findings in the
 * caller's input order (engine output order, which downstream rendering
 * preserves today).
 */
function finalizeFindings(protos: ProtoFinding[]): Finding[] {
  const sortedIndices = protos
    .map((_, i) => i)
    .sort(
      (a, b) => protos[a].baseKey.localeCompare(protos[b].baseKey) || a - b,
    );
  const counts = new Map<string, number>();
  // sortedIndices is a permutation of every index, so each slot is filled.
  const out: Finding[] = [];
  for (const i of sortedIndices) {
    const { baseKey, build } = protos[i];
    const occurrence = counts.get(baseKey) ?? 0;
    counts.set(baseKey, occurrence + 1);
    out[i] = build(`${baseKey}#${occurrence}`);
  }
  return out;
}

/**
 * onion `LintIssue` → token-anchored `Finding`. The full issue rides along as
 * producer payload: the default decorator reads `issue.fix`, the message
 * formatter reads `messageParams`/`message`.
 */
export function lintIssuesToFindings(issues: LintIssue[]): Finding[] {
  return finalizeFindings(
    issues.map((issue) => ({
      baseKey: `onion:${issue.code}:${issue.tokenId ?? ""}:${issue.relatedTokenId ?? ""}`,
      build: (id): Finding => ({
        id,
        source: "onion",
        code: issue.code,
        severity: issue.severity,
        category: issue.issueType === "content" ? "content" : "structure",
        anchor: {
          kind: "token",
          tokenId: issue.tokenId ?? issue.relatedTokenId ?? "?",
          sid: issue.sid,
        },
        // onion issues hover-match on either their token or related
        // token (the old hover behavior).
        touchedTokenIds: [issue.tokenId, issue.relatedTokenId].filter(
          (tokenId): tokenId is string => typeof tokenId === "string",
        ),
        issue,
      }),
    })),
  );
}

/**
 * Bucket a pass's findings by chapter for `FindingsStore.commitBookFindings`.
 * The book is the commit's concern (pipeline scope is authoritative); the sid
 * contributes only chapter. No sid, or an unparseable one (`"unknown
 * location"`), buckets under chapter 0 — front matter, not the floor. Note
 * `?? 0` / `== null` semantics: chapter 0 from a parsed sid is an address and
 * must survive (the old LintStore grouping dropped it via a falsy check).
 */
export function groupFindingsByChapter(findings: Finding[]): FindingsByChapter {
  const grouped: FindingsByChapter = {};
  for (const finding of findings) {
    const sid = finding.anchor.sid;
    const chapter = (sid != null ? parseSid(sid)?.chapter : null) ?? 0;
    grouped[chapter] ??= [];
    grouped[chapter].push(finding);
  }
  return grouped;
}

/** The onion commit payload in one step: normalize, then chapter-bucket. */
export function onionFindingsByChapter(issues: LintIssue[]): FindingsByChapter {
  return groupFindingsByChapter(lintIssuesToFindings(issues));
}

/**
 * local-lint numbering issues → token-anchored `Finding`s. Severity comes from
 * the code (`LOCAL_LINT_SEVERITY`); the category is `"content"` (verse/chapter
 * numbers are part of the content — "consistency" is the reason these aren't
 * onion's, not a user-facing category). The marching facts ride along as
 * `params` for the message; the anchor token-id is the identity, so re-running
 * over unchanged tokens yields identical ids. The owner
 * (`localLintPipeline.ts`) supplies the issues — it owns which scope produced
 * them.
 */
export function localLintIssuesToFindings(issues: LocalLintIssue[]): Finding[] {
  return finalizeFindings(
    issues.map((issue) => ({
      baseKey: `local-lint:${issue.code}:${issue.tokenId}:`,
      build: (id): Finding => ({
        id,
        source: "local-lint",
        code: issue.code,
        severity: LOCAL_LINT_SEVERITY[issue.code],
        category: "content",
        // No sid: canonical tokens don't carry one, and the owner buckets these
        // by chapter directly (not via `groupFindingsByChapter`).
        anchor: { kind: "token", tokenId: issue.tokenId },
        touchedTokenIds: [issue.tokenId],
        params: { found: issue.found, previous: issue.previous },
      }),
    })),
  );
}

/**
 * One off-dominant `\cl` label, pre-normalization. `label` is the off stem and
 * `dominant` the project's, both for the message; the owner buckets the finding
 * by the chapter it found the label in.
 */
export type ChapterLabelIssue = {
  textTokenId: string;
  label: string;
  dominant: string;
};

/**
 * local-lint `\cl` issues → token-anchored `Finding`s (code
 * `"inconsistent-chapter-label"`, `warning`). Anchored to the label's text
 * token — the same token onion's old rule used — so the dormant chapter-label
 * "Standardize across project…" decorator relights on it.
 */
export function localLintChapterLabelFindings(
  issues: ChapterLabelIssue[],
): Finding[] {
  return finalizeFindings(
    issues.map((issue) => ({
      baseKey: `local-lint:inconsistent-chapter-label:${issue.textTokenId}:`,
      build: (id): Finding => ({
        id,
        source: "local-lint",
        code: "inconsistent-chapter-label",
        severity: "warning",
        category: "content",
        anchor: { kind: "token", tokenId: issue.textTokenId },
        touchedTokenIds: [issue.textTokenId],
        label: issue.label,
        dominant: issue.dominant,
      }),
    })),
  );
}

/** sous `SousFinding` → content-anchored `Finding`. All sous rules are content. */
export function sousFindingsToFindings(findings: SousFinding[]): Finding[] {
  return finalizeFindings(
    findings.map((finding) => ({
      baseKey: `sous-chef:${finding.code}:${finding.sid}:${finding.start}:${finding.end}`,
      build: (id): Finding => ({
        id,
        source: "sous-chef",
        code: finding.code,
        severity: finding.severity,
        category: "content",
        anchor: {
          kind: "content",
          sid: finding.sid,
          range: { start: finding.start, end: finding.end },
        },
        score: finding.score,
      }),
    })),
  );
}
