// webMirrorEngines.ts
//
// Binds the mirror's engine/persistence callbacks to the browser stack: the
// same wasm onion + resident Galley engine, and an OPFS
// `DirtyBufferStore` for the backup write. Runs inside the web worker — none of
// these touch the DOM or Tauri `invoke`, so they work in worker scope (S2: a
// worker can't invoke, but web persistence is OPFS, which it can).
//
// This is the web worker's engine set and the only one that pulls in wasm.
// Desktop uses the native Rust resident for the same Braid operations.

import type {
  MirrorEngines,
  ResidentBraidBook,
} from "@/app/domain/mirror/WorkspaceMirror.ts";
import { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";
import { webMd5Service } from "@/core/domain/md5/webMd5.ts";
import { WebBraidHost } from "@/web/domain/sous/WebBraidHost.ts";
import { WebGalleyService } from "@/web/domain/sous/WebGalleyService.ts";
import { OpfsFileSystem } from "@/web/persistence/OpfsFileSystem.ts";
import { OpfsStorageRoots } from "@/web/persistence/OpfsStorageRoots.ts";

export function makeWebMirrorEngines(args: {
  workspaceKey: string;
  dirtyBufferRoot: string;
}): MirrorEngines {
  const roots = new OpfsStorageRoots();
  const fileSystem = new OpfsFileSystem(roots);
  const braid = new WebBraidHost();
  const galley = new WebGalleyService({
    braid,
    fileSystem,
    root: roots.cacheRoot,
    workspaceKey: args.workspaceKey,
  });
  const dirtyBufferStore = new DirtyBufferStore(
    fileSystem,
    webMd5Service,
    args.dirtyBufferRoot,
  );

  return {
    lintFindings: () => braid.lintFindings(),
    seedGalley: (books: ResidentBraidBook[], config) =>
      galley.seed(books, config),
    updateGalleyChapter: (bookCode, chapterNum, tokens) =>
      galley.updateChapter(bookCode, chapterNum, tokens),
    updateGalleyBook: (bookCode, tokens, lineEnding) =>
      galley.updateBook(bookCode, tokens, lineEnding),
    removeGalleyChapter: (bookCode, chapterNum) =>
      galley.removeChapter(bookCode, chapterNum),
    removeGalleyBook: (bookCode) => galley.removeBook(bookCode),
    updateGalleyConfig: (config) => galley.updateConfig(config),
    analyzeGalley: (config, cachePolicy) =>
      galley.analyzePacked(config, cachePolicy),
    loadGalley: (config) => galley.loadCachedPacked(config),
    formatBraid: (scope, options) => galley.formatBraid(scope, options),
    applyBraidFix: (bookCode, fix) => galley.applyBraidFix(bookCode, fix),
    publishBraid: () => galley.publishBraid(),
    restoreBraid: (packed, records) => galley.restoreBraid(packed, records),
    setBraidBaseline: (bookCode, tokens, eol) =>
      galley.setBraidBaseline(bookCode, tokens, eol),
    clearBraidBaseline: (bookCode) => galley.clearBraidBaseline(bookCode),
    isBraidDirty: (bookCode) => galley.isBraidDirty(bookCode),
    braidUsfm: (bookCode) => galley.braidUsfm(bookCode),
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
      return true;
    },
    dispose() {
      galley.dispose();
    },
  };
}
