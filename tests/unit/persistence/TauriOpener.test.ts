import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";

const mocks = vi.hoisted(() => {
    let zipInput: Record<string, Uint8Array> | null = null;
    return {
        saveMock: vi.fn(async () => "/tmp/export.zip"),
        writeFileMock: vi.fn(async () => {}),
        revealItemInDirMock: vi.fn(async () => {}),
        zipSyncMock: vi.fn((input: Record<string, Uint8Array>) => {
            zipInput = input;
            return new Uint8Array([1, 2, 3]);
        }),
        getZipInput: () => zipInput,
    };
});

vi.mock("@tauri-apps/plugin-dialog", () => ({
    save: mocks.saveMock,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
    writeFile: mocks.writeFileMock,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
    revealItemInDir: mocks.revealItemInDirMock,
}));

vi.mock("fflate", () => ({
    zipSync: mocks.zipSyncMock,
}));

import { TauriOpener } from "@/tauri/persistence/TauriOpener.ts";

describe("TauriOpener", () => {
    beforeEach(() => {
        mocks.saveMock.mockClear();
        mocks.writeFileMock.mockClear();
        mocks.revealItemInDirMock.mockClear();
        mocks.zipSyncMock.mockClear();
    });

    it("includes an explicit top-level root directory entry when exporting", async () => {
        const fileSystem = new InMemoryFileSystem({
            "/userData/projects/reg/manifest.yaml": "projects: []",
            "/userData/projects/reg/content/usfm.txt": "hello",
        });
        const opener = new TauriOpener(fileSystem);

        await opener.export("/userData/projects/reg");

        expect(mocks.zipSyncMock).toHaveBeenCalledTimes(1);
        const zipInput = mocks.getZipInput();
        expect(zipInput).not.toBeNull();
        expect(Object.keys(zipInput ?? {})).toContain("/reg/");
        expect(zipInput?.["/reg/"]).toBeInstanceOf(Uint8Array);
        expect(zipInput?.["/reg/"]).toHaveLength(0);
        expect(zipInput?.["/reg/manifest.yaml"]).toBeInstanceOf(Uint8Array);
        expect(zipInput?.["/reg/content/usfm.txt"]).toBeInstanceOf(
            Uint8Array,
        );
        expect(mocks.saveMock).toHaveBeenCalledWith({
            defaultPath: "reg.zip",
            filters: [{ name: "Zip", extensions: ["zip"] }],
        });
        expect(mocks.writeFileMock).toHaveBeenCalledWith(
            "/tmp/export.zip",
            new Uint8Array([1, 2, 3]),
        );
    });
});
