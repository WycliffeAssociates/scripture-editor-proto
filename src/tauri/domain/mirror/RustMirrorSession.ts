// RustMirrorSession.ts
//
// The desktop lint/sous half of the mirror feed. On desktop the feed is
// multicast across two sinks: the backup worker (crash-recovery backup) and
// this one, which forwards token patches to the Rust resident mirror
// (`mirror_push_patch`) and analyze commands to the generation-aware Rust
// analyze commands (`mirror_lint`/`mirror_sous_analyze`). Backup commands are
// the backup worker's; this sink ignores them.
//
// Patches are fire-and-forget invokes (the Rust mirror applies idempotently by
// generation, so order doesn't matter). Analyze invokes resolve to a per-book
// result tagged with the generation it ran against; the result is delivered
// back into the feed as a `lintResult`/`sousResult` for the existing router. A
// `behind` result (the mirror hasn't applied the requested generation yet, on
// this unordered transport) is NOT delivered as findings — it would clear the
// stores — but as a `resyncRequest`, which re-seeds the mirror from current
// store state.

import { invoke } from "@tauri-apps/api/core";

import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type {
  MirrorCommand,
  MirrorPatch,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import type { SousAnalyzeResult } from "@/core/domain/sous/sousTypes.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

type MirrorLintResultDto = {
  byBook: Record<string, LintIssue[]>;
  ranAtGeneration: number;
  behind: boolean;
};

type MirrorSousResultDto = {
  byBook: Record<string, SousAnalyzeResult>;
  ranAtGeneration: number;
  behind: boolean;
};

export class RustMirrorSession {
  private readonly removeSink: () => void;
  // The patch payload uses `ref` (a JS-fine key); Rust deserializes it via a
  // renamed field. The protocol's `ChapterRef` already carries `bookCode` /
  // `chapterNum`, which match the Rust DTO field names by construction.

  constructor(args: { feed: MirrorFeed }) {
    this.removeSink = args.feed.addSink({
      pushPatch: (patch: MirrorPatch) => {
        void invoke("mirror_push_patch", { patch }).catch((error: unknown) => {
          console.error("[mirror] mirror_push_patch failed", { error });
        });
      },
      sendCommand: (command: MirrorCommand) => {
        switch (command.kind) {
          case "analyzeLint":
            this.runLint(args.feed, command);
            return;
          case "analyzeSous":
            this.runSous(args.feed, command);
            return;
          // writeBackup / clearBackup belong to the backup worker sink.
          default:
            return;
        }
      },
    });
  }

  private runLint(
    feed: MirrorFeed,
    command: Extract<MirrorCommand, { kind: "analyzeLint" }>,
  ): void {
    void invoke<MirrorLintResultDto>("mirror_lint", {
      scope: command.scope,
      generation: command.generation,
    })
      .then((result) => {
        if (result.behind) {
          feed.deliverResult({
            kind: "resyncRequest",
            lastGeneration: command.generation,
          });
          return;
        }
        feed.deliverResult({
          kind: "lintResult",
          byBook: result.byBook,
          ranAtGeneration: result.ranAtGeneration,
        });
      })
      .catch((error: unknown) => {
        console.error("[mirror] mirror_lint failed", { error });
      });
  }

  private runSous(
    feed: MirrorFeed,
    command: Extract<MirrorCommand, { kind: "analyzeSous" }>,
  ): void {
    void invoke<MirrorSousResultDto>("mirror_sous_analyze", {
      scope: command.scope,
      generation: command.generation,
    })
      .then((result) => {
        if (result.behind) {
          feed.deliverResult({
            kind: "resyncRequest",
            lastGeneration: command.generation,
          });
          return;
        }
        feed.deliverResult({
          kind: "sousResult",
          byBook: result.byBook,
          ranAtGeneration: result.ranAtGeneration,
        });
      })
      .catch((error: unknown) => {
        console.error("[mirror] mirror_sous_analyze failed", { error });
      });
  }

  dispose(): void {
    this.removeSink();
  }
}
