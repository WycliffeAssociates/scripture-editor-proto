// serviceMirrorEngines.ts
//
// Binds the mirror's engine/persistence callbacks to the shared service seams
// for an in-process mirror (desktop interim). Lint/sous keep their existing
// service implementations (Tauri invoke paths on desktop) — the mirror just
// calls them with the tokens it assembled from resident state. The dirty-buffer
// write goes through the same `DirtyBufferStore` seam main used before.

import type { MirrorEngines } from "@/app/domain/mirror/WorkspaceMirror.ts";
import type {
  DirtyBufferFile,
  DirtyBufferStore,
} from "@/app/state/DirtyBufferStore.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { ISousService } from "@/core/domain/sous/ISousService.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

export function makeServiceMirrorEngines(args: {
  usfmOnionService: IUsfmOnionService;
  sousService: ISousService;
  md5Service: IMd5Service;
  dirtyBufferStore: DirtyBufferStore;
  workspaceKey: string;
}): MirrorEngines {
  return {
    lintBook: (tokens) => args.usfmOnionService.lintExisting(tokens),
    analyzeSousBook: (tokens) => args.sousService.analyze(tokens),
    computeMd5: (content) => args.md5Service.calculateMd5(content),
    async persistBackup(bookCode, envelopeJson) {
      const entry = JSON.parse(envelopeJson) as DirtyBufferFile;
      await args.dirtyBufferStore.put(args.workspaceKey, bookCode, entry);
      return true;
    },
    async clearBackup(bookCode) {
      await args.dirtyBufferStore.clear(args.workspaceKey, bookCode);
    },
  };
}
