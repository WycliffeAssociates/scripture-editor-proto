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
// this unordered transport) means the patch for this generation hasn't landed
// yet. The race is transient — the time for one in-flight `mirror_push_patch`
// to apply — so we retry the same analyze a bounded number of times with a
// short delay before giving up. Only on exhaustion do we fall back to a
// `resyncRequest`, which re-tokenizes the whole project from current store
// state and is far too heavy a first response to a transient race. A `behind`
// result is never delivered as findings — that would clear the stores.

import { invoke } from "@tauri-apps/api/core";

import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type {
  AnalyzeScope,
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

// A `behind` result means the patch for this generation is still in flight on
// the unordered transport. Retry the same analyze this many times, sleeping the
// matching delay before each retry, before falling back to a full resync.
const BEHIND_RETRY_DELAYS_MS = [150, 300];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type BehindResultDto = { behind: boolean };

// Shared runner for the two near-identical analyze paths. Invokes the analyze
// command; on a `behind` result it retries the same invoke per
// BEHIND_RETRY_DELAYS_MS (the patch is still in flight), and only delivers a
// `resyncRequest` once retries are exhausted. A fresh (not-behind) result is
// handed to `deliver` to be shaped into the kind-specific feed result.
async function runAnalyze<R extends BehindResultDto>(args: {
  feed: MirrorFeed;
  command: "mirror_lint" | "mirror_sous_analyze";
  scope: AnalyzeScope;
  generation: number;
  deliver: (result: R) => void;
}): Promise<void> {
  const { feed, command, scope, generation, deliver } = args;
  try {
    for (let attempt = 0; ; attempt++) {
      const result = await invoke<R>(command, { scope, generation });
      if (!result.behind) {
        deliver(result);
        return;
      }
      if (attempt >= BEHIND_RETRY_DELAYS_MS.length) {
        // Retries exhausted: the patch never landed, so fall back to a full
        // re-seed from current store state.
        feed.deliverResult({
          kind: "resyncRequest",
          lastGeneration: generation,
        });
        return;
      }
      await sleep(BEHIND_RETRY_DELAYS_MS[attempt]);
    }
  } catch (error: unknown) {
    console.error(`[mirror] ${command} failed`, { error });
  }
}

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
    void runAnalyze<MirrorLintResultDto>({
      feed,
      command: "mirror_lint",
      scope: command.scope,
      generation: command.generation,
      // Echo the command's correlation id (when present) so an awaiting caller
      // — the load contract's initial pass — can match this specific result.
      deliver: (result) =>
        feed.deliverResult({
          kind: "lintResult",
          byBook: result.byBook,
          ranAtGeneration: result.ranAtGeneration,
          requestId: command.requestId,
        }),
    });
  }

  private runSous(
    feed: MirrorFeed,
    command: Extract<MirrorCommand, { kind: "analyzeSous" }>,
  ): void {
    void runAnalyze<MirrorSousResultDto>({
      feed,
      command: "mirror_sous_analyze",
      scope: command.scope,
      generation: command.generation,
      deliver: (result) =>
        feed.deliverResult({
          kind: "sousResult",
          byBook: result.byBook,
          ranAtGeneration: result.ranAtGeneration,
          requestId: command.requestId,
        }),
    });
  }

  dispose(): void {
    this.removeSink();
  }
}
