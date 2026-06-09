import { describe, expect, it, vi } from "vitest";
import { TauriUsfmOnionService } from "@/tauri/domain/usfm/TauriUsfmOnionService.ts";
import { WebUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

const { invokeMock } = vi.hoisted(() => ({
    invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
    invoke: invokeMock,
}));

describe("TauriUsfmOnionService path I/O", () => {
    it("exposes desktop path capability", () => {
        const service = new TauriUsfmOnionService();
        expect(service.supportsPathIo).toBe(true);
    });

    it("uses only the remaining path-backed command payloads", async () => {
        const service = new TauriUsfmOnionService();
        invokeMock
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([[]]);

        await service.parseUsfmBatchFromPaths(
            ["/tmp/a.usfm", "/tmp/b.usfm"],
            {},
        );
        await service.lintScope([{ path: "/tmp/a.usfm" }], {
            lintOptions: {},
        });
        await service.formatScope([{ path: "/tmp/a.usfm" }]);
        await service.diffScope(
            [{ baselinePath: "/tmp/a.usfm", currentPath: "/tmp/b.usfm" }],
            {
                tokenOptions: {},
                buildOptions: {},
            },
        );

        expect(invokeMock).toHaveBeenNthCalledWith(
            1,
            "usfm_onion_project_paths",
            {
                paths: ["/tmp/a.usfm", "/tmp/b.usfm"],
                options: {
                    tokenOptions: { mergeHorizontalWhitespace: false },
                    lintOptions: null,
                    includeSourceMd5: false,
                },
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(2, "usfm_onion_lint_paths", {
            paths: ["/tmp/a.usfm"],
            options: {
                scope: "book",
                allowImplicitChapterContentVerse: false,
                disabledCodes: undefined,
                enabledCodes: undefined,
                suppressed: undefined,
            },
        });
        expect(invokeMock).toHaveBeenNthCalledWith(
            3,
            "usfm_onion_format_paths",
            {
                paths: ["/tmp/a.usfm"],
                tokenOptions: { mergeHorizontalWhitespace: false },
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            4,
            "usfm_onion_diff_path_pairs",
            {
                pathPairs: [
                    { baselinePath: "/tmp/a.usfm", currentPath: "/tmp/b.usfm" },
                ],
                tokenOptions: { mergeHorizontalWhitespace: false },
                buildOptions: {},
            },
        );
    });
});

describe("WebUsfmOnionService path I/O", () => {
    it("marks path I/O as unsupported", () => {
        const service = new WebUsfmOnionService();
        expect(service.supportsPathIo).toBe(false);
    });

    it("throws explicit unsupported errors for remaining path-backed APIs", async () => {
        const service = new WebUsfmOnionService();
        await expect(
            service.parseUsfmBatchFromPaths(["/tmp/a.usfm"]),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(
            service.lintScope([{ path: "/tmp/a.usfm" }]),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(
            service.formatScope([{ path: "/tmp/a.usfm" }]),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(
            service.diffScope([
                { baselinePath: "/tmp/a.usfm", currentPath: "/tmp/b.usfm" },
            ]),
        ).rejects.toThrow("Path I/O is desktop-only");
    });
});
