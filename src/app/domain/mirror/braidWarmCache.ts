import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

import type { BraidPublication, RestoreBraidRecord } from "./mirrorProtocol.ts";

const CACHE_DIR = "braid";
const CORPUS_FILE = "corpus.bin";
const SOURCES_FILE = "sources.json";

export function braidWarmCacheDirectory(
  cacheRoot: string,
  workspaceKey: string,
): string {
  return `${cacheRoot}/${CACHE_DIR}/${encodeURIComponent(workspaceKey)}`;
}

export async function readBraidWarmCache(args: {
  fileSystem: FileSystem;
  cacheRoot: string;
  workspaceKey: string;
}): Promise<{ packed: ArrayBuffer; records: RestoreBraidRecord[] } | null> {
  const directory = braidWarmCacheDirectory(args.cacheRoot, args.workspaceKey);
  try {
    const [packed, sourcesJson] = await Promise.all([
      args.fileSystem.readBytes(`${directory}/${CORPUS_FILE}`),
      args.fileSystem.readText(`${directory}/${SOURCES_FILE}`),
    ]);
    const parsed: unknown = JSON.parse(sourcesJson);
    if (!Array.isArray(parsed)) return null;
    const records = parsed.map((item): RestoreBraidRecord => {
      if (
        !item ||
        typeof item !== "object" ||
        typeof (item as { bookCode?: unknown }).bookCode !== "string" ||
        typeof (item as { sourceKey?: unknown }).sourceKey !== "string" ||
        typeof (item as { source?: unknown }).source !== "string"
      ) {
        throw new Error("invalid Braid source manifest");
      }
      return item as RestoreBraidRecord;
    });
    return { packed: packed.slice().buffer, records };
  } catch {
    return null;
  }
}

export async function writeBraidWarmCache(args: {
  fileSystem: FileSystem;
  cacheRoot: string;
  workspaceKey: string;
  publication: BraidPublication;
  project?: Project;
}): Promise<boolean> {
  const directory = braidWarmCacheDirectory(args.cacheRoot, args.workspaceKey);
  try {
    const expected = new Map(
      args.publication.sources.map((source) => [
        source.bookCode,
        source.source,
      ]),
    );
    if (args.project) {
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
    await args.fileSystem.mkdir(directory, { recursive: true });
    await args.fileSystem.atomicWriteText(
      `${directory}/${SOURCES_FILE}`,
      JSON.stringify(args.publication.sources),
    );
    await args.fileSystem.atomicWriteBytes(
      `${directory}/${CORPUS_FILE}`,
      new Uint8Array(args.publication.packed),
    );
    return true;
  } catch (error) {
    await Promise.all(
      [CORPUS_FILE, SOURCES_FILE].map(async (file) => {
        try {
          await args.fileSystem.remove(`${directory}/${file}`);
        } catch {
          // A missing or unreadable cache is already a cache miss.
        }
      }),
    );
    console.warn("[braid] warm-cache write skipped", error);
    return false;
  }
}
