// braidWarmCache.ts
//
// The Braid warm-cache sidecar: one opaque `corpus.bin` per workspace under the
// app cache root. Disposable reload acceleration, never project data — deleting
// the whole directory can only cost a cold parse.
//
// The file is bytes and nothing else. There is no source manifest beside it and
// no app-side validity check: the loader hands the sidecar plus the exact disk
// bytes it just read to resident Braid, which verifies structure, checksums,
// stamps and per-book source hashes itself. Existence is never validity, so a
// write ALWAYS replaces atomically — including over a file that a previous open
// rejected, which is the only way a corrupt sidecar ever heals.

import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

import type { BraidPublication } from "./mirrorProtocol.ts";
import { logCacheWrite } from "./startupLog.ts";

const CACHE_DIR = "braid";
const CORPUS_FILE = "corpus.bin";

function braidWarmCacheDirectory(
  cacheRoot: string,
  workspaceKey: string,
): string {
  return `${cacheRoot}/${CACHE_DIR}/${encodeURIComponent(workspaceKey)}`;
}

function braidWarmCachePath(cacheRoot: string, workspaceKey: string): string {
  return `${braidWarmCacheDirectory(cacheRoot, workspaceKey)}/${CORPUS_FILE}`;
}

/** Read the sidecar's opaque bytes. A miss of any kind is `null`. */
export async function readBraidWarmCache(args: {
  fileSystem: FileSystem;
  cacheRoot: string;
  workspaceKey: string;
}): Promise<Uint8Array | null> {
  try {
    return await args.fileSystem.readBytes(
      braidWarmCachePath(args.cacheRoot, args.workspaceKey),
    );
  } catch {
    return null;
  }
}

/** Replace the sidecar with `packed`. Best-effort: failure is a future miss. */
export async function putBraidWarmCache(args: {
  fileSystem: FileSystem;
  cacheRoot: string;
  workspaceKey: string;
  packed: Uint8Array;
  origin: "load" | "save";
}): Promise<boolean> {
  const directory = braidWarmCacheDirectory(args.cacheRoot, args.workspaceKey);
  try {
    await args.fileSystem.mkdir(directory, { recursive: true });
    await args.fileSystem.atomicWriteBytes(
      `${directory}/${CORPUS_FILE}`,
      args.packed,
    );
    logCacheWrite({
      arm: "braid",
      workspace: args.workspaceKey,
      origin: args.origin,
      state: "written",
      bytes: args.packed.byteLength,
    });
    return true;
  } catch (error) {
    logCacheWrite({
      arm: "braid",
      workspace: args.workspaceKey,
      origin: args.origin,
      state: "failed",
      error: String(error),
    });
    return false;
  }
}

/**
 * Post-save warming. The publication's ordered sources are Braid's own
 * serialization of what save just wrote, so the sidecar is only eligible when
 * every book on disk still equals it byte for byte — a partial save or a later
 * write leaves the older entry rather than labelling newer bytes as saved.
 */
export async function writeBraidWarmCache(args: {
  fileSystem: FileSystem;
  cacheRoot: string;
  workspaceKey: string;
  publication: BraidPublication;
  project?: Project;
}): Promise<boolean> {
  try {
    if (args.project) {
      const expected = new Map(
        args.publication.sources.map((source) => [
          source.bookCode,
          source.source,
        ]),
      );
      const books = await args.project.listBooks();
      if (books.length !== expected.size) {
        throw new Error("incomplete Braid source set");
      }
      for (const book of books) {
        const disk = await args.project.getBook(book.storageKey);
        if (expected.get(book.bookCode) !== disk.contents) {
          throw new Error(`saved Braid source mismatch for ${book.bookCode}`);
        }
      }
    }
  } catch (error) {
    logCacheWrite({
      arm: "braid",
      workspace: args.workspaceKey,
      origin: "save",
      state: "skipped",
      reason: String(error),
    });
    return false;
  }
  return putBraidWarmCache({
    fileSystem: args.fileSystem,
    cacheRoot: args.cacheRoot,
    workspaceKey: args.workspaceKey,
    packed: new Uint8Array(args.publication.packed),
    origin: "save",
  });
}
