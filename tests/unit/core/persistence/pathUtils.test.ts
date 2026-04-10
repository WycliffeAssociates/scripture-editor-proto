import { describe, expect, it } from "vitest";
import {
    basenameStoragePath,
    dirnameStoragePath,
    normalizeStoragePath,
} from "@/core/persistence/pathUtils.ts";

describe("pathUtils", () => {
    it("normalizes windows-style absolute paths without adding a leading slash", () => {
        expect(
            normalizeStoragePath(
                "C:\\Users\\test\\AppData\\Roaming\\org.example\\projects\\demo",
            ),
        ).toBe("C:/Users/test/AppData/Roaming/org.example/projects/demo");
    });

    it("derives basename and dirname for windows-style absolute paths", () => {
        const path =
            "C:\\Users\\test\\AppData\\Roaming\\org.example\\projects\\demo";
        expect(basenameStoragePath(path)).toBe("demo");
        expect(dirnameStoragePath(path)).toBe(
            "C:/Users/test/AppData/Roaming/org.example/projects",
        );
    });

    it("preserves windows drive roots when deriving dirname", () => {
        expect(dirnameStoragePath("C:/projects")).toBe("C:/");
        expect(dirnameStoragePath("C:/")).toBe("C:/");
    });
});
