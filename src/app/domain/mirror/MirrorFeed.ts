// MirrorFeed.ts
//
// The main side of a mirror session: a multicast register of sinks, plus the
// result-handler register for the return path. The patch producer and the
// repointed pipelines write through this; one transport (the web worker) is
// the only sink today, but `addSink` is N-ary so a future cold-loop mirror
// subscribes to the same feed with no producer change.

import type {
  MirrorCommand,
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
  sendCommand(command: MirrorCommand): void {
    for (const sink of this.sinks) sink.sendCommand(command);
  }

  /** Called by a transport when a result arrives back from its mirror. */
  deliverResult(result: MirrorResult): void {
    for (const handler of this.resultHandlers) handler(result);
  }

  get sinkCount(): number {
    return this.sinks.size;
  }
}
