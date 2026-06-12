// workspaceMirror.worker.ts
//
// The web workspace-mirror worker. Holds ONE `WorkspaceMirror` in module scope:
// the resident token mirror plus lint wasm, sous wasm, and the OPFS dirty-buffer
// backup write — all off the main thread. It is a thin pump: patches/commands
// in on the FIFO channel, results out. The behavior lives in `WorkspaceMirror`
// (testable without a Worker); this file only wires the engines and marshals
// messages.

import type {
  FromWorkerMessage,
  ToWorkerMessage,
} from "@/app/domain/mirror/workerMessages.ts";
import { WorkspaceMirror } from "@/app/domain/mirror/WorkspaceMirror.ts";
import { initializeUsfmMarkerCatalog } from "@/core/domain/usfm/onionMarkers.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

import { makeWebMirrorEngines } from "./webMirrorEngines.ts";

let mirror: WorkspaceMirror | null = null;

function post(message: FromWorkerMessage): void {
  (self as unknown as { postMessage(message: unknown): void }).postMessage(
    message,
  );
}

// Messages are processed strictly in arrival order on one promise chain.
// `init` awaits the wasm marker catalog, so a patch or command that arrives
// behind it (the load-time fullSync seed does) must queue until the mirror
// exists — concurrent handling would land it on `null` and silently drop it.
let chain: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<ToWorkerMessage>) => {
  chain = chain.then(() =>
    handleMessage(event.data).catch((error: unknown) => {
      // A failed init (wasm load) or command must be loud: with the mirror
      // null or stale every later message no-ops and the symptom is silence.
      console.error(
        `[mirror.worker] ${event.data.kind} failed`,
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
    }),
  );
};

async function handleMessage(message: ToWorkerMessage): Promise<void> {
  switch (message.kind) {
    case "init": {
      // The marker catalog is module-global in onion's wasm and must be
      // seeded once per worker before any lint/parse call.
      initializeUsfmMarkerCatalog(await webUsfmOnionService.getMarkerCatalog());
      mirror = new WorkspaceMirror(
        makeWebMirrorEngines({
          workspaceKey: message.workspaceKey,
          dirtyBufferRoot: message.dirtyBufferRoot,
        }),
      );
      console.info("[mirror.worker] initialized (wasm engines ready)");
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
