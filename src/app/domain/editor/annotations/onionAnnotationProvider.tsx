// onionAnnotationProvider.tsx
//
// The default, onion-namespaced producer for the annotation spine: turns a
// `LintIssue` into an `EditorAnnotation`. This reproduces today's lint-popover
// behavior exactly — the localized message plus, when the issue carries an
// upstream `fix`, a single primary action that applies it. onion's
// once-special single-`fix` model stops being special here: it's just a
// provider that emits one action.
//
// Per-code overrides live in `onionProviders` (empty today). Phase 2 registers
// `inconsistent-chapter-label` to augment the message with an app-defined,
// project-scoped action — without touching this default path.

import { t } from "@lingui/core/macro";
import { Wand2 } from "lucide-react";
import type {
    AnnotationAction,
    EditorAnnotation,
} from "@/app/domain/editor/annotations/editorAnnotation.ts";
import { getLintIssueKey } from "@/app/ui/hooks/lintState.ts";
import {
    formatLintIssueMessage,
    formatTokenFixLabel,
} from "@/app/ui/i18n/usfmOnionLocalization.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Dependencies a provider closes over to build action `run`s.
 *
 * - `applyFix`: the lint-fix applier (wired to `actions.fixLintError`).
 * - `onStandardizeChapterLabels`: opens the project-wide chapter-label picker
 *   (Phase 2). Optional so call sites that don't offer it — e.g. form mode's
 *   synthetic issues — still type-check; the chapter-label provider simply
 *   omits the action when it's absent.
 */
export type OnionProviderContext = {
    applyFix: (issue: LintIssue) => void | Promise<void>;
    onStandardizeChapterLabels?: () => void;
};

type OnionAnnotationProvider = (
    issue: LintIssue,
    ctx: OnionProviderContext,
) => EditorAnnotation;

function fixAction(
    issue: LintIssue,
    ctx: OnionProviderContext,
): AnnotationAction[] {
    if (!issue.fix) return [];
    const fix = issue.fix;
    return [
        {
            id: "fix",
            label: formatTokenFixLabel(fix),
            kind: "primary",
            icon: <Wand2 size={14} />,
            run: () => ctx.applyFix(issue),
        },
    ];
}

const defaultOnionProvider: OnionAnnotationProvider = (issue, ctx) => ({
    id: getLintIssueKey(issue),
    source: "onion",
    code: issue.code,
    severity: issue.severity,
    anchor: {
        kind: "token",
        tokenId: issue.tokenId ?? issue.relatedTokenId ?? "?",
        sid: issue.sid,
    },
    message: formatLintIssueMessage(issue),
    actions: fixAction(issue, ctx),
    // The token-ids this issue covers, for the hover zip. onion issues match on
    // either their token or related token (the old hover behavior).
    touchedTokenIds: [issue.tokenId, issue.relatedTokenId].filter(
        (id): id is string => typeof id === "string",
    ),
});

/**
 * `inconsistent-chapter-label` carries no upstream fix (the repair is a
 * project-wide judgement call, not a canonical single-site edit). Keep the
 * default message + add a project-scoped action that opens the standardize
 * picker. The action is omitted when no opener is wired (see context doc).
 */
const chapterLabelProvider: OnionAnnotationProvider = (issue, ctx) => {
    const base = defaultOnionProvider(issue, ctx);
    if (!ctx.onStandardizeChapterLabels) return base;
    const standardize: AnnotationAction = {
        id: "standardize-chapter-label",
        label: t`Standardize across project…`,
        kind: "default",
        run: () => ctx.onStandardizeChapterLabels?.(),
    };
    return { ...base, actions: [...(base.actions ?? []), standardize] };
};

/** Per-code overrides; the default provider handles everything else. */
const onionProviders: Partial<Record<string, OnionAnnotationProvider>> = {
    "inconsistent-chapter-label": chapterLabelProvider,
};

export function lintIssueToAnnotation(
    issue: LintIssue,
    ctx: OnionProviderContext,
): EditorAnnotation {
    const provider = onionProviders[issue.code] ?? defaultOnionProvider;
    return provider(issue, ctx);
}

export function lintIssuesToAnnotations(
    issues: LintIssue[],
    ctx: OnionProviderContext,
): EditorAnnotation[] {
    return issues.map((issue) => lintIssueToAnnotation(issue, ctx));
}
