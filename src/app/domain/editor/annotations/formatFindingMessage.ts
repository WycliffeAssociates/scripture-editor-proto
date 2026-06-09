// formatFindingMessage.ts
//
// THE message formatter — the single place a `Finding` becomes user-facing
// text. Every surface (popover, overlay, panel) renders findings through
// decoration, and decoration formats here, so the same finding can never read
// differently in two places. Findings store no display strings, so a locale
// switch simply re-formats on the next render — no invalidation path, no
// staleness window.

import { localizeSousFindingMessage } from "@/app/ui/i18n/sousLocalization.ts";
import { formatLintIssueMessage } from "@/app/ui/i18n/usfmOnionLocalization.ts";
import type { Finding } from "./finding.ts";

export function formatFindingMessage(finding: Finding): string {
    switch (finding.source) {
        case "onion":
            // Localizes by code + messageParams; the issue's raw engine
            // `message` is the locale-independent fallback for unknown codes.
            return formatLintIssueMessage(finding.issue);
        case "sous-chef":
            // Localizes by code; humanizes unmapped rule ids.
            return localizeSousFindingMessage(finding.code);
    }
}
