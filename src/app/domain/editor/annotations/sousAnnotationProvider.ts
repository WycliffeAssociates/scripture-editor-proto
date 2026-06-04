// sousAnnotationProvider.ts
//
// Normalizes scripture-sous-chef findings into the `EditorAnnotation` spine —
// the sous-side sibling of `onionAnnotationProvider`. Each finding becomes a
// `content`-anchored annotation `(sid, Utf16Span)`; `touchedTokenIds` is filled
// later at resolve time (the editor runs `resolveContentRange` for the rects
// anyway, and reuses the covered token-ids for the hover zip).

import type { EditorAnnotation } from "@/app/domain/editor/annotations/editorAnnotation.ts";
import { localizeSousFindingMessage } from "@/app/ui/i18n/sousLocalization.ts";
import type { SousFinding } from "@/core/domain/sous/sousTypes.ts";

/** Stable identity for a finding (sid + rule + range). */
export function sousFindingId(finding: SousFinding): string {
    return `sous:${finding.sid}:${finding.code}:${finding.start}:${finding.end}`;
}

export function sousFindingToAnnotation(
    finding: SousFinding,
): EditorAnnotation {
    return {
        id: sousFindingId(finding),
        source: "sous-chef",
        code: finding.code,
        severity: finding.severity,
        anchor: {
            kind: "content",
            sid: finding.sid,
            range: { start: finding.start, end: finding.end },
        },
        message: localizeSousFindingMessage(finding.code),
        score: finding.score,
    };
}

export function sousFindingsToAnnotations(
    findings: SousFinding[],
): EditorAnnotation[] {
    return findings.map(sousFindingToAnnotation);
}
