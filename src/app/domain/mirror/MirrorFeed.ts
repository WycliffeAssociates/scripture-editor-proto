// MirrorFeed.ts
//
// The main side of a mirror session: a multicast register of sinks, plus the
// result-handler register for the return path. The patch producer and the
// repointed pipelines write through this; one transport (the web worker) is
// the only sink today, but `addSink` is N-ary so a future cold-loop mirror
// subscribes to the same feed with no producer change.

import { markEditCommand, markEditResult } from "./editTrace.ts";
import type {
  HostCommand,
  MirrorPatch,
  MirrorResult,
  MirrorResultHandler,
  MirrorSink,
} from "./mirrorProtocol.ts";

export class MirrorFeed {
  private readonly sinks = new Set<MirrorSink>();
  private readonly resultHandlers = new Set<MirrorResultHandler>();

  addSink(sink: MirrorSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  /** Register a consumer of results coming back from any mirror. */
  onResult(handler: MirrorResultHandler): () => void {
    this.resultHandlers.add(handler);
    return () => this.resultHandlers.delete(handler);
  }

  /** Fan a patch to every sink (patches precede commands on a FIFO sink). */
  pushPatch(patch: MirrorPatch): void {
    for (const sink of this.sinks) sink.pushPatch(patch);
  }

  /** Fan a command to every sink. */
  sendCommand(command: HostCommand, transfer?: Transferable[]): void {
    // The one place every command leaves main, on every platform — so the edit
    // trace opens its round trip here rather than in each pipeline.
    markEditCommand(command.generation, command.kind);
    for (const sink of this.sinks) sink.sendCommand(command, transfer);
  }

  /** Called by a transport when a result arrives back from its mirror. */
  deliverResult(result: MirrorResult): void {
    const command = commandKindOf(result);
    if (command && "ranAtGeneration" in result) {
      markEditResult(result.ranAtGeneration, command);
    }
    for (const handler of this.resultHandlers) handler(result);
  }

  get sinkCount(): number {
    return this.sinks.size;
  }
}

/** The command a result answers, for the edit trace's round-trip bookkeeping. */
function commandKindOf(result: MirrorResult): string | null {
  switch (result.kind) {
    case "lintResult":
      return "analyzeLint";
    case "galleyResult":
      return "analyzeGalley";
    case "backupResult":
      return "writeBackup";
    default:
      return null;
  }
}
