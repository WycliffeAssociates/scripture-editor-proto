import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebZenFsRuntime } from "@/web/zenfs/WebZenFsRuntime.ts";

const hoisted = vi.hoisted(() => {
    const configureSingle = vi.fn(async () => {});
    const fs = {
        promises: {},
    };
    const getDirectory = vi.fn(async () => ({ kind: "directory" }));
    return { configureSingle, fs, getDirectory };
});

vi.mock("@zenfs/core", () => ({
    configureSingle: hoisted.configureSingle,
    fs: hoisted.fs,
}));

vi.mock("@zenfs/dom", () => ({
    WebAccess: { name: "WebAccess" },
}));

describe("WebZenFsRuntime", () => {
    beforeEach(() => {
        hoisted.configureSingle.mockClear();
        hoisted.getDirectory.mockClear();
        Object.defineProperty(globalThis, "navigator", {
            value: {
                storage: {
                    getDirectory: hoisted.getDirectory,
                },
            },
            configurable: true,
        });
    });

    it("initializes once across repeated ensureReady calls", async () => {
        const runtime = new WebZenFsRuntime();
        await runtime.ensureReady();
        await runtime.ensureReady();

        expect(hoisted.configureSingle).toHaveBeenCalledTimes(1);
        expect(hoisted.getDirectory).toHaveBeenCalledTimes(1);
    });

    it("sets global Buffer when missing", async () => {
        const previousBuffer = (globalThis as { Buffer?: unknown }).Buffer;
        Reflect.deleteProperty(globalThis as { Buffer?: unknown }, "Buffer");

        const runtime = new WebZenFsRuntime();
        await runtime.ensureReady();

        expect((globalThis as { Buffer?: unknown }).Buffer).toBeDefined();

        if (previousBuffer !== undefined) {
            (globalThis as { Buffer?: unknown }).Buffer = previousBuffer;
        }
    });

    it("exposes configured fs object", async () => {
        const runtime = new WebZenFsRuntime();
        await runtime.ensureReady();
        expect(runtime.fs).toBe(hoisted.fs);
    });
});
