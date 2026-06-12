// webMirrorEngines.ts
//
// Binds the mirror's engine/persistence callbacks to the browser stack: the
// same wasm onion + sous services the single-thread path used, and an OPFS
// `DirtyBufferStore` for the backup write. Runs inside the worker — none of
// these touch the DOM or Tauri `invoke`, so they work in worker scope (S2: a
// worker can't invoke, but web persistence is OPFS, which it can).

import type { MirrorEngines } from "@/app/domain/mirror/WorkspaceMirror.ts";
import { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";
import { webMd5Service } from "@/core/domain/md5/webMd5.ts";
import type { LintIssue, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import { WebSousService } from "@/web/domain/sous/WebSousService.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";
import { OpfsFileSystem } from "@/web/persistence/OpfsFileSystem.ts";
import { OpfsStorageRoots } from "@/web/persistence/OpfsStorageRoots.ts";

export function makeWebMirrorEngines(args: {
  workspaceKey: string;
  dirtyBufferRoot: string;
}): MirrorEngines {
  const sous = new WebSousService();
  const fileSystem = new OpfsFileSystem(new OpfsStorageRoots());
  const dirtyBufferStore = new DirtyBufferStore(
    fileSystem,
    webMd5Service,
    args.dirtyBufferRoot,
  );

  return {
    async lintBook(tokens: Token[]): Promise<LintIssue[]> {
      return webUsfmOnionService.lintExisting(tokens);
    },
    analyzeSousBook: (tokens) => sous.analyze(tokens),
    computeMd5: (content) => webMd5Service.calculateMd5(content),
    async persistBackup(bookCode, envelopeJson) {
      // The worker can persist directly to OPFS — round-trip the envelope
      // through the store so the body-md5/baseline contract is the store's,
      // not duplicated here.
      const entry = JSON.parse(envelopeJson);
      await dirtyBufferStore.put(args.workspaceKey, bookCode, entry);
      return true;
    },
    async clearBackup(bookCode) {
      await dirtyBufferStore.clear(args.workspaceKey, bookCode);
    },
  };
}
