// backupWorker.worker.ts
//
// The desktop backup worker. Holds ONE `WorkspaceMirror` in module scope whose
// engines are backup-only (no wasm lint/sous — those run Rust-side on desktop).
// It receives the same token patches as the Rust mirror (multicast feed) so it
// has the resident tokens to serialize, plus the `writeBackup`/`clearBackup`
// commands. It can't `invoke` (S2), so it serializes + md5s in-worker and ships
// the envelope bytes back; main does the FS write/clear through the store seam.
//
// A thin pump like the web worker: patches/commands in on the FIFO channel,
// results out. No marker-catalog seed and no wasm import — keeping this worker
// wasm-free is what guarantees the desktop bundle hosts no web-only engines.

import type {
  FromWorkerMessage,
  ToWorkerMessage,
} from "@/app/domain/mirror/workerMessages.ts";
import { WorkspaceMirror } from "@/app/domain/mirror/WorkspaceMirror.ts";

import { makeBackupOnlyMirrorEngines } from "./backupOnlyMirrorEngines.ts";

let mirror: WorkspaceMirror | null = null;

function post(message: FromWorkerMessage): void {
  (self as unknown as { postMessage(message: unknown): void }).postMessage(
    message,
  );
}

// Messages are processed strictly in arrival order on one promise chain —
// concurrent handling could run a book's writeBackup and clearBackup out of
// order and leave a stale backup behind.
let chain: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<ToWorkerMessage>) => {
  chain = chain.then(() =>
    handleMessage(event.data).catch((error: unknown) => {
      console.error(
        `[mirror.backup-worker] ${event.data.kind} failed`,
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
    }),
  );
};

async function handleMessage(message: ToWorkerMessage): Promise<void> {
  switch (message.kind) {
    case "init": {
      mirror = new WorkspaceMirror(makeBackupOnlyMirrorEngines());
      // ACK init so the session's `ready()` resolves (no wasm here, so this is
      // effectively immediate — but the contract is uniform with the web worker).
      post({ kind: "ready" });
      return;
    }
    case "patch": {
      mirror?.applyPatch(message.patch);
      return;
    }
    case "command": {
      if (!mirror) return;
      const result = await mirror.runCommand(message.command);
      post({ kind: "result", result });
      return;
    }
  }
}
