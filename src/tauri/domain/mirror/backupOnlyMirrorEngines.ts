// backupOnlyMirrorEngines.ts
//
// The desktop backup worker's engine set. It hosts NO analysis engines — on
// desktop, lint/sous run Rust-side against the resident `State` token mirror,
// never in this worker — and it cannot persist, because a worker can't `invoke`
// to reach Tauri FS (S2). So it serializes + md5s in-worker (both pure JS via
// the mirror's own `serializeChaptersToUsfm` over resident tokens) and bounces
// the finished envelope bytes back to main, which does the one dumb FS write
// through the `DirtyBufferStore` seam.
//
// Deliberately imports NO wasm (no onion/sous): keeping this module wasm-free is
// what guarantees the desktop backup worker bundle carries no web-only engines.

import type { MirrorEngines } from "@/app/domain/mirror/WorkspaceMirror.ts";
import { webMd5Service } from "@/core/domain/md5/webMd5.ts";

export function makeBackupOnlyMirrorEngines(): MirrorEngines {
  const unsupported = (): never => {
    throw new Error(
      "[mirror] desktop backup worker has no analysis engines (lint/sous run Rust-side)",
    );
  };
  return {
    lintBook: unsupported,
    analyzeSousBook: unsupported,
    computeMd5: (content) => webMd5Service.calculateMd5(content),
    // Bounce: ship the bytes back for main's one dumb FS write through the store.
    persistBackup: async () => false,
    // Bounce: main clears through the store seam.
    clearBackup: async () => false,
  };
}
