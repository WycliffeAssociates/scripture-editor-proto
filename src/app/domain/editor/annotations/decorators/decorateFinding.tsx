// decorateFinding.tsx
//
// The decorator registry: `(source, code) → decorate(finding, ctx) →
// { actions, details }`. Findings are pure data; THIS is where behavior
// attaches, at the React edge, from a generic capability context assembled
// once per workspace (`useDecorateFindings`). The ctx carries only generic
// capabilities — store, gate, history, services, modal outlet — never a
// bespoke per-feature callback; feature logic lives in domain functions
// co-located with their decorators (lintFix.ts, chapterLabelStandardize.ts).
//
// Actions are facts about the finding, not the surface: decorators never
// check mode or surface. Whether a finding is *seen* somewhere is the
// presentation policy's job (phase 3).

import { t } from "@lingui/core/macro";
import { Wand2 } from "lucide-react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { FindingsStore } from "@/app/state/FindingsStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import type { WorkspaceModalStore } from "@/app/state/WorkspaceModalStore.ts";
import { ChapterLabelPicker } from "@/app/ui/components/blocks/ChapterLabelPicker.tsx";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { formatTokenFixLabel } from "@/app/ui/i18n/usfmOnionLocalization.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type {
    DecoratedFinding,
    Finding,
    FindingAction,
    FindingDetails,
} from "../finding.ts";
import { formatFindingMessage } from "../formatFindingMessage.ts";
import {
    computeChapterLabelTally,
    standardizeChapterLabels,
} from "./chapterLabelStandardize.ts";
import { fixLintFinding } from "./lintFix.ts";

/**
 * The generic capabilities decorators close over to build action `run`s.
 * Assembled once at the React edge (`useDecorateFindings`); deliberately NOT
 * one optional callback per feature — that pattern smears features across the
 * ctx type, every assembly site, and the decorator.
 */
export type FindingDecorationContext = {
    workingFilesStore: WorkingFilesStore;
    interactionGate: WorkspaceGateStore;
    history: CustomHistoryHook;
    usfmOnionService: IUsfmOnionService;
    editorMode: EditorModeSetting;
    /** For fix flows' no-op fallback publish (see lintFix.ts). */
    findingsStore: FindingsStore;
    /** The workspace modal outlet (see WorkspaceModalStore.ts). */
    openModal: WorkspaceModalStore["open"];
    closeModal: () => void;
};

type FindingDecoration = {
    actions: FindingAction[];
    details?: FindingDetails;
};

type OnionFinding = Extract<Finding, { source: "onion" }>;
type OnionDecorator = (
    finding: OnionFinding,
    ctx: FindingDecorationContext,
) => FindingDecoration;

// The default onion decoration: when the issue carries an upstream `fix`, one
// primary action that applies it. onion's once-special single-`fix` model
// stops being special here — it's just a decorator that emits one action.
const defaultOnionDecorator: OnionDecorator = (finding, ctx) => {
    const fix = finding.issue.fix;
    if (!fix) return { actions: [] };
    return {
        actions: [
            {
                id: "fix",
                label: formatTokenFixLabel(fix),
                kind: "primary",
                icon: <Wand2 size={14} />,
                run: () => fixLintFinding(finding.issue, ctx),
            },
        ],
    };
};

/**
 * `inconsistent-chapter-label` carries no upstream fix (the repair is a
 * project-wide judgement call, not a canonical single-site edit). Keep the
 * default decoration + add a project-scoped action: tally the labels and open
 * the standardize picker through the workspace modal outlet. Confirm runs the
 * same domain function any other doorway would.
 */
const chapterLabelDecorator: OnionDecorator = (finding, ctx) => {
    const base = defaultOnionDecorator(finding, ctx);
    const standardize: FindingAction = {
        id: "standardize-chapter-label",
        label: t`Standardize across project…`,
        kind: "default",
        run: () => {
            // The tally is derived from the committed working files only when
            // the user opens the picker (a click, not a hover), so the hover
            // path stays cheap.
            const tally = computeChapterLabelTally(
                ctx.workingFilesStore.read(),
            );
            ctx.openModal(ChapterLabelPicker, {
                isOpen: true,
                tally,
                onConfirm: (targetStem: string) => {
                    ctx.closeModal();
                    void standardizeChapterLabels(targetStem, ctx);
                },
            });
        },
    };
    return { ...base, actions: [...base.actions, standardize] };
};

/** Per-code onion overrides; the default decorator handles everything else. */
const onionDecorators: Partial<Record<string, OnionDecorator>> = {
    "inconsistent-chapter-label": chapterLabelDecorator,
};

function decorationFor(
    finding: Finding,
    ctx: FindingDecorationContext,
): FindingDecoration {
    switch (finding.source) {
        case "onion": {
            const decorator =
                onionDecorators[finding.code] ?? defaultOnionDecorator;
            return decorator(finding, ctx);
        }
        case "sous-chef":
            // sous findings are report-only today; content fixes arrive later
            // as per-code decorators calling their own domain functions.
            return { actions: [] };
    }
}

export function decorateFinding(
    finding: Finding,
    ctx: FindingDecorationContext,
): DecoratedFinding {
    return {
        id: finding.id,
        finding,
        message: formatFindingMessage(finding),
        ...decorationFor(finding, ctx),
    };
}

/**
 * Decoration for surfaces that offer no capabilities (form mode's synthetic
 * read-only affordances): message only, zero actions, no ctx required. If a
 * capability-less surface ever needs real actions, it should grow a ctx and
 * use `decorateFinding` instead.
 */
export function decorateFindingInert(finding: Finding): DecoratedFinding {
    return {
        id: finding.id,
        finding,
        message: formatFindingMessage(finding),
        actions: [],
    };
}
