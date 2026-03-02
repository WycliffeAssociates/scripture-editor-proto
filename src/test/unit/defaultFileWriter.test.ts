import { describe, expect, it, vi } from "vitest";
import { FileWriter } from "@/core/io/DefaultFileWriter.ts";

describe("FileWriter.writeFile", () => {
    it("clears existing file contents before writing replacement text", async () => {
        const truncate = vi.fn(async () => {});
        const seek = vi.fn(async () => {});
        const write = vi.fn(async () => {});
        const close = vi.fn(async () => {});
        const createWritable = vi.fn(async () => ({
            truncate,
            seek,
            write,
            close,
        }));
        const asFileHandle = vi.fn(() => ({
            createWritable,
        }));
        const getHandle = vi.fn(async () => ({
            asFileHandle,
        }));

        const writer = new FileWriter(
            { getHandle } as never,
            { path: "/project" } as never,
        );

        await writer.writeFile("manifest.yaml", "next");

        expect(getHandle).toHaveBeenCalledWith("/project/manifest.yaml");
        expect(createWritable).toHaveBeenCalledWith({
            keepExistingData: false,
        });
        expect(truncate).toHaveBeenCalledWith(0);
        expect(seek).toHaveBeenCalledWith(0);
        expect(write).toHaveBeenCalledWith("next");
        expect(close).toHaveBeenCalledOnce();
    });
});
