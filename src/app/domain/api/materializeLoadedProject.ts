// materializeLoadedProject.ts
//
// The main thread's half of a resident load. The host returns bytes; this turns
// them into the editor's book state and the project's first-paint findings.
//
// The verification step is not a second opinion on the host's work — it is how
// tokens become available on main at all. `materializePublished` only accepts
// the opaque handle `verifyPublishedPacked` mints, and minting it requires the
// exact source bytes the container is bound to. That is why the load carries
// every book's source: not to re-check the host, but because certification is
// the decoder's entry condition. Verification also hands back Rust-materialized
// findings for the same snapshot, so the load IS the initial lint.

import type { LintIssue } from "usfm-onion-web";
import * as onion from "usfm-onion-web";
import {
  materializePublished,
  verifyPublishedPacked,
} from "usfm-onion-web/packed";

import { materializePublishedTokensToParsedFiles } from "@/app/domain/api/scriptureProjectToParsedFiles.ts";
import type {
  LoadedProjectBook,
  LoadProjectResult,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import {
  logStartupPhase,
  startupElapsed,
} from "@/app/domain/mirror/startupLog.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { GalleyAnalysis } from "@/core/domain/sous/galleyTypes.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

export type MaterializedLoadedProject = {
  parsedFiles: ScriptureBookState[];
  /** md5 of each book's exact disk bytes, hashed by the host that read them. */
  diskMd5ByBook: Map<string, string>;
  braidFindings: ReadonlyMap<string, readonly LintIssue[]>;
  galley: GalleyAnalysis | null;
};

export function materializeLoadedProject(args: {
  loadedProject: Project;
  load: LoadProjectResult;
}): MaterializedLoadedProject {
  const { load } = args;
  if (!load.packed || !load.sources || !load.books) {
    throw new Error(
      load.error ?? "Resident project load returned no publication",
    );
  }
  const startedAt = startupElapsed();
  const sources = new Uint8Array(load.sources);
  const verified = verifyPublishedPacked(
    onion,
    new Uint8Array(load.packed),
    load.books.map((book) => ({
      book: book.bookCode,
      // A view, not a copy: the verifier slices the range it needs itself.
      source: sources.subarray(
        book.byteOffset,
        book.byteOffset + book.byteLength,
      ),
    })),
  );
  if (!verified.ok) {
    throw new Error(
      `Braid publication verification failed: ${JSON.stringify(verified.error)}`,
    );
  }
  const materialized = materializePublished(verified.verified);
  const parsedFiles = materializePublishedTokensToParsedFiles({
    loadedProject: args.loadedProject,
    tokensByBook: new Map(
      [...materialized].map(([book, value]) => [book, value.tokens]),
    ),
  });
  assertCorpusOrder(load.books, parsedFiles);
  logStartupPhase(
    "main:materialize",
    {
      state: load.state,
      books: parsedFiles.length,
      findings: verified.findings.size,
      bytes: load.packed.byteLength,
    },
    { startedAt, durationMs: startupElapsed() - startedAt },
  );
  return {
    parsedFiles,
    diskMd5ByBook: new Map(
      load.books.map((book) => [book.bookCode, book.sourceMd5]),
    ),
    braidFindings: verified.findings,
    galley: load.galley ?? null,
  };
}

/**
 * The resident corpus is an ordered array, and main derives verse addressing
 * from its own book order — so the two orders must be the same order. A
 * mismatch does not fail anything visibly: it addresses the same sids in a
 * different sequence, and findings quietly land on the wrong verses. Cheap to
 * check once per load, and the only place both orders exist side by side.
 */
function assertCorpusOrder(
  resident: readonly LoadedProjectBook[],
  parsed: readonly ScriptureBookState[],
): void {
  const residentOrder = resident.map((book) => book.bookCode).join(",");
  const mainOrder = parsed.map((book) => book.bookCode).join(",");
  if (residentOrder !== mainOrder) {
    throw new Error(
      `Resident corpus order does not match the editor's book order.\n` +
        `  resident: ${residentOrder}\n` +
        `  main:     ${mainOrder}`,
    );
  }
}
