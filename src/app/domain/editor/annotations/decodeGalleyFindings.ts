import {
  decodeFindings,
  decodePersistedFindings,
  reconcileFindings,
  type FindingSnapshot,
} from "scripture-sous-chef-web/findings";

import type { GalleyAnalysis } from "@/core/domain/sous/galleyTypes.ts";
import type {
  SousAnalyzeResult,
  SousFinding,
} from "@/core/domain/sous/sousTypes.ts";

const sousFindingsByOfficialArray = new WeakMap<object, SousFinding[]>();

function timed<T>(label: string, operation: () => T): T {
  if (import.meta.env.DEV) console.time(label);
  try {
    return operation();
  } finally {
    if (import.meta.env.DEV) console.timeEnd(label);
  }
}

/** Decode the official packed snapshot at the one main-thread ownership seam. */
export function decodeGalleyAnalysis(
  analysis: GalleyAnalysis,
  previousSnapshot?: FindingSnapshot,
): SousAnalyzeResult & { snapshot: FindingSnapshot } {
  const bytes = new Uint8Array(analysis.packed);
  let snapshot: FindingSnapshot;
  if (analysis.cacheState === "persisted") {
    const identity = analysis.expectedIdentity;
    if (!identity) {
      throw new Error("Persisted Galley findings are missing cache identity");
    }
    snapshot = timed("sous:findings.decode:persisted", () =>
      decodePersistedFindings(bytes, analysis.keys, {
        analysisId: BigInt(identity.analysisId),
        targetContextId: BigInt(identity.targetContextId),
        hasReference: identity.hasReference,
      }),
    );
  } else {
    const reconciled = timed(
      `sous:findings.${previousSnapshot ? "reconcile" : "decode"}:fresh`,
      () =>
        previousSnapshot
          ? reconcileFindings(previousSnapshot, bytes, analysis.keys)
          : decodeFindings(bytes, analysis.keys),
    );
    // Reconciliation may return equivalent rows through a new snapshot
    // wrapper. Keep the official unchanged findings array itself stable when
    // every row is reused, so downstream memoization can observe that no
    // finding collection changed.
    snapshot =
      previousSnapshot &&
      reconciled.findings.length === previousSnapshot.findings.length &&
      reconciled.findings.every(
        (finding, index) => finding === previousSnapshot.findings[index],
      )
        ? { ...reconciled, findings: previousSnapshot.findings }
        : reconciled;
  }
  let findings = sousFindingsByOfficialArray.get(snapshot.findings);
  if (!findings) {
    findings = snapshot.findings.map(
      (finding): SousFinding => ({
        sid: finding.sid,
        code: finding.code,
        severity: finding.severity,
        start: finding.start,
        end: finding.end,
        score: finding.score ?? undefined,
        snapshotFinding: finding,
      }),
    );
    sousFindingsByOfficialArray.set(snapshot.findings, findings);
  }
  return {
    snapshot,
    segments: analysis.segments,
    findings,
  };
}
