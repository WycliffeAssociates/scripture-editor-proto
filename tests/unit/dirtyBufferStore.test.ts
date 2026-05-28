import { describe, expect, it } from "vitest";
import {
    type DirtyBufferFile,
    DIRTY_BUFFER_SCHEMA_VERSION,
    DirtyBufferStore,
} from "@/app/state/DirtyBufferStore.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";

const ROOT = "/appData/dirty-buffers";
const WS = "demo";

// Identity MD5: the wrapper's bodyMd5 must equal its content to validate. Keeps
// round-trip and torn-write assertions trivial to reason about.
const identityMd5: IMd5Service = {
    calculateMd5: async (text: string) => text,
};

function makeWrapper(content: string, bodyMd5 = content): DirtyBufferFile {
    return {
        schemaVersion: DIRTY_BUFFER_SCHEMA_VERSION,
        diskBaseline: { kind: "absent" },
        bodyMd5,
        writtenAt: 0,
        appVersion: "test",
        content,
    };
}

function newStore() {
    const fs = new InMemoryFileSystem();
    const store = new DirtyBufferStore(fs, identityMd5, ROOT);
    return { fs, store };
}

describe("DirtyBufferStore", () => {
    it("round-trips a valid backup", async () => {
        const { store } = newStore();
        await store.put(WS, "GEN", makeWrapper("\\c 1 hello"));

        const result = await store.read(WS, "GEN");
        expect(result.kind).toBe("valid");
        if (result.kind === "valid") {
            expect(result.entry.content).toBe("\\c 1 hello");
        }
    });

    it("reports missing for an absent backup", async () => {
        const { store } = newStore();
        expect((await store.read(WS, "GEN")).kind).toBe("missing");
    });

    it("flags a torn write (body-md5 mismatch)", async () => {
        const { store } = newStore();
        await store.put(WS, "GEN", makeWrapper("real content", "stale-checksum"));
        const result = await store.read(WS, "GEN");
        expect(result.kind).toBe("unreadable");
        if (result.kind === "unreadable") {
            expect(result.reason).toBe("body-md5-mismatch");
        }
    });

    it("flags malformed JSON", async () => {
        const { fs, store } = newStore();
        await fs.atomicWriteText(`${ROOT}/${WS}/GEN.json`, "{ not json");
        const result = await store.read(WS, "GEN");
        expect(result.kind).toBe("unreadable");
        if (result.kind === "unreadable") expect(result.reason).toBe("json-parse");
    });

    it("flags an unsupported schema version", async () => {
        const { fs, store } = newStore();
        await fs.atomicWriteText(
            `${ROOT}/${WS}/GEN.json`,
            JSON.stringify({ schemaVersion: 99, content: "x", bodyMd5: "x" }),
        );
        const result = await store.read(WS, "GEN");
        expect(result.kind).toBe("unreadable");
        if (result.kind === "unreadable") expect(result.reason).toBe("schema-version");
    });

    it("flags a wrapper with a missing/garbage diskBaseline (would crash recovery otherwise)", async () => {
        const { fs, store } = newStore();
        // Checksum-valid body, but diskBaseline is null — recovery dereferences
        // diskBaseline.kind, so this must be refused at read time.
        await fs.atomicWriteText(
            `${ROOT}/${WS}/GEN.json`,
            JSON.stringify({
                schemaVersion: DIRTY_BUFFER_SCHEMA_VERSION,
                content: "x",
                bodyMd5: "x",
                diskBaseline: null,
                writtenAt: 0,
                appVersion: "t",
            }),
        );
        const result = await store.read(WS, "GEN");
        expect(result.kind).toBe("unreadable");
        if (result.kind === "unreadable") {
            expect(result.reason).toBe("schema-version");
        }
    });

    it("clear removes a backup and is a no-op when already gone", async () => {
        const { store } = newStore();
        await store.put(WS, "GEN", makeWrapper("x"));
        // Reports `true` when it actually removed a file, `false` on no-op.
        await expect(store.clear(WS, "GEN")).resolves.toBe(true);
        expect((await store.read(WS, "GEN")).kind).toBe("missing");
        await expect(store.clear(WS, "GEN")).resolves.toBe(false);
    });

    it("list classifies every backup in a workspace and ignores non-json files", async () => {
        const { fs, store } = newStore();
        await store.put(WS, "GEN", makeWrapper("genesis"));
        await fs.atomicWriteText(`${ROOT}/${WS}/EXO.json`, "{ broken");
        await fs.atomicWriteText(`${ROOT}/${WS}/notes.txt`, "ignore me");

        const entries = await store.list(WS);
        const byBook = new Map(entries.map((e) => [e.bookCode, e.result.kind]));
        expect(byBook.get("GEN")).toBe("valid");
        expect(byBook.get("EXO")).toBe("unreadable");
        expect(byBook.has("notes")).toBe(false);
    });

    it("list returns empty for a workspace with no backups", async () => {
        const { store } = newStore();
        expect(await store.list("never-opened")).toEqual([]);
    });
});
