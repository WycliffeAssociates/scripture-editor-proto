// braidWarmCache.test.ts
//
// The sidecar is disposable acceleration, and the two properties that make it
// safe are: a bad entry can always be replaced (otherwise a corrupt file makes
// every future open cold, forever), and no failure of it can be observed as
// anything but a miss.

import { describe, expect, it, vi } from "vitest";

import {
  dropBraidWarmCache,
  putBraidWarmCache,
  readBraidWarmCache,
  writeBraidWarmCache,
} from "@/app/domain/mirror/braidWarmCache.ts";
import { transferablesOf } from "@/app/domain/mirror/resultTransferables.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";

function makeFileSystem(seed: Record<string, Uint8Array> = {}) {
  const files = new Map(Object.entries(seed));
  const fileSystem = {
    readBytes: async (path: string) => {
      const bytes = files.get(path);
      if (!bytes) throw new Error(`ENOENT ${path}`);
      return bytes;
    },
    atomicWriteBytes: async (path: string, content: Uint8Array) => {
      files.set(path, content);
    },
    atomicWriteText: async () => {},
    mkdir: async () => {},
    remove: async (path: string) => {
      files.delete(path);
    },
    exists: async (path: string) => files.has(path),
  } as unknown as FileSystem;
  return { fileSystem, files };
}

const CACHE_PATH = "/cache/braid/proj/corpus.bin";

describe("Braid warm cache", () => {
  it("replaces an existing entry so a rejected sidecar can heal", async () => {
    const { fileSystem, files } = makeFileSystem({
      [CACHE_PATH]: new Uint8Array([0xde, 0xad]),
    });

    await putBraidWarmCache({
      fileSystem,
      cacheRoot: "/cache",
      workspaceKey: "proj",
      packed: new Uint8Array([1, 2, 3]),
      origin: "load",
    });

    // Existence is never validity: the fresh container overwrites the entry the
    // last open refused, so the NEXT open is warm rather than cold again.
    expect(files.get(CACHE_PATH)).toEqual(new Uint8Array([1, 2, 3]));
    await expect(
      readBraidWarmCache({
        fileSystem,
        cacheRoot: "/cache",
        workspaceKey: "proj",
      }),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("reports a write failure without throwing", async () => {
    const { fileSystem } = makeFileSystem();
    vi.spyOn(fileSystem, "atomicWriteBytes").mockRejectedValue(
      new Error("disk full"),
    );

    await expect(
      putBraidWarmCache({
        fileSystem,
        cacheRoot: "/cache",
        workspaceKey: "proj",
        packed: new Uint8Array([1]),
        origin: "save",
      }),
    ).resolves.toBe(false);
  });

  it("treats a missing or unreadable entry as a miss", async () => {
    const { fileSystem } = makeFileSystem();
    await expect(
      readBraidWarmCache({
        fileSystem,
        cacheRoot: "/cache",
        workspaceKey: "proj",
      }),
    ).resolves.toBeNull();
  });

  it("skips the post-save write when a book on disk no longer matches", async () => {
    const { fileSystem, files } = makeFileSystem();
    const project = {
      listBooks: async () => [{ bookCode: "MAT", storageKey: "MAT" }],
      // Disk moved after the receipt was captured.
      getBook: async () => ({ contents: "\\id MAT later edit\n" }),
    };

    const written = await writeBraidWarmCache({
      fileSystem,
      cacheRoot: "/cache",
      workspaceKey: "proj",
      publication: {
        packed: new Uint8Array([9]).buffer,
        snapshotId: "s1",
        books: [],
        sources: [{ bookCode: "MAT", sourceKey: "MAT", source: "\\id MAT\n" }],
        serializedBooks: [],
      },
      project: project as never,
    });

    expect(written).toBe(false);
    expect(files.has(CACHE_PATH)).toBe(false);
  });
});

describe("dropping a sidecar main refused", () => {
  // A container the HOST accepted can still fail main's certification, and
  // that failure has no fallback of its own — the load throws and the route
  // dies. Dropping the entry turns a stale cache file back into what it is
  // supposed to be: one slow open, not an unopenable project.
  it("removes the entry so the next open is cold", async () => {
    const { fileSystem, files } = makeFileSystem({
      [CACHE_PATH]: new Uint8Array([1, 2, 3]),
    });
    await dropBraidWarmCache({
      fileSystem,
      cacheRoot: "/cache",
      workspaceKey: "proj",
    });
    expect(files.has(CACHE_PATH)).toBe(false);
    expect(
      await readBraidWarmCache({
        fileSystem,
        cacheRoot: "/cache",
        workspaceKey: "proj",
      }),
    ).toBeNull();
  });

  it("is a no-op when there is nothing to drop", async () => {
    const { fileSystem } = makeFileSystem();
    await expect(
      dropBraidWarmCache({
        fileSystem,
        cacheRoot: "/cache",
        workspaceKey: "proj",
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows a delete failure — a surviving entry is only a future refusal", async () => {
    const { fileSystem } = makeFileSystem({
      [CACHE_PATH]: new Uint8Array([1]),
    });
    vi.spyOn(fileSystem, "remove").mockRejectedValue(new Error("EPERM"));
    await expect(
      dropBraidWarmCache({
        fileSystem,
        cacheRoot: "/cache",
        workspaceKey: "proj",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("worker result transfer list", () => {
  it("transfers every large buffer a load carries", () => {
    const packed = new ArrayBuffer(8);
    const sources = new ArrayBuffer(16);
    const galleyPacked = new ArrayBuffer(4);

    const transfers = transferablesOf({
      kind: "loadProjectResult",
      state: "cold",
      ranAtGeneration: 0,
      packed,
      sources,
      books: [],
      galley: {
        packed: galleyPacked,
        keys: [],
        cacheState: "fresh",
      },
    });

    // Omitting any of the three would structure-clone the whole corpus.
    expect(transfers).toEqual([packed, sources, galleyPacked]);
  });

  it("omits absent buffers on a rejected load", () => {
    expect(
      transferablesOf({
        kind: "loadProjectResult",
        state: "rejected",
        ranAtGeneration: 0,
        error: "nope",
      }),
    ).toEqual([]);
  });
});
