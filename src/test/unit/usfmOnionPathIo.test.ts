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

    it("uses path command names and payloads", async () => {
        const service = new TauriUsfmOnionService();
        invokeMock.mockResolvedValue("ok");

        await service.projectUsfmFromPath("/tmp/a.usfm", {});
        await service.projectUsfmBatchFromPaths(
            ["/tmp/a.usfm", "/tmp/b.usfm"],
            {},
        );
        await service.tokensFromPath("/tmp/a.usfm", {});
        await service.lintPath("/tmp/a.usfm", {});
        await service.lintBatchFromPaths(["/tmp/a.usfm"], {});
        await service.lintScope([{ path: "/tmp/a.usfm" }], {
            lintOptions: {},
            batchOptions: { parallel: true },
        });
        await service.formatBatchFromPaths(["/tmp/a.usfm"], {}, {});
        await service.formatScope([{ path: "/tmp/a.usfm" }], {
            tokenOptions: {},
            formatOptions: {},
            batchOptions: { parallel: true },
        });
        await service.toUsjFromPath("/tmp/a.usfm");
        await service.toUsjBatchFromPaths(["/tmp/a.usfm"]);
        await service.toUsxFromPath("/tmp/a.usfm");
        await service.toUsxBatchFromPaths(["/tmp/a.usfm"]);
        await service.toVrefFromPath("/tmp/a.usfm");
        await service.toVrefBatchFromPaths(["/tmp/a.usfm"]);
        await service.diffPaths("/tmp/a.usfm", "/tmp/b.usfm", {}, {});
        await service.diffPathsByChapter("/tmp/a.usfm", "/tmp/b.usfm", {}, {});
        await service.diffBatchFromPathPairs(
            [{ baselinePath: "/tmp/a.usfm", currentPath: "/tmp/b.usfm" }],
            {},
            {},
        );
        await service.diffScope(
            [{ baselinePath: "/tmp/a.usfm", currentPath: "/tmp/b.usfm" }],
            {
                tokenOptions: {},
                buildOptions: {},
                batchOptions: { parallel: true },
            },
        );

        expect(invokeMock).toHaveBeenNthCalledWith(
            1,
            "usfm_onion_project_path",
            {
                path: "/tmp/a.usfm",
                options: {},
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            2,
            "usfm_onion_project_paths",
            {
                paths: ["/tmp/a.usfm", "/tmp/b.usfm"],
                options: {},
                batchOptions: { parallel: true },
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            3,
            "usfm_onion_tokens_from_path",
            {
                path: "/tmp/a.usfm",
                options: {},
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(4, "usfm_onion_lint_path", {
            path: "/tmp/a.usfm",
            options: {},
        });
        expect(invokeMock).toHaveBeenNthCalledWith(5, "usfm_onion_lint_paths", {
            paths: ["/tmp/a.usfm"],
            options: {},
            batchOptions: { parallel: true },
        });
        expect(invokeMock).toHaveBeenNthCalledWith(6, "usfm_onion_lint_paths", {
            paths: ["/tmp/a.usfm"],
            options: {},
            batchOptions: { parallel: true },
        });
        expect(invokeMock).toHaveBeenNthCalledWith(
            7,
            "usfm_onion_format_paths",
            {
                paths: ["/tmp/a.usfm"],
                tokenOptions: {},
                formatOptions: {},
                batchOptions: { parallel: true },
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            8,
            "usfm_onion_format_paths",
            {
                paths: ["/tmp/a.usfm"],
                tokenOptions: {},
                formatOptions: {},
                batchOptions: { parallel: true },
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            9,
            "usfm_onion_to_usj_path",
            {
                path: "/tmp/a.usfm",
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            10,
            "usfm_onion_to_usj_paths",
            {
                paths: ["/tmp/a.usfm"],
                batchOptions: { parallel: true },
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            11,
            "usfm_onion_to_usx_path",
            {
                path: "/tmp/a.usfm",
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            12,
            "usfm_onion_to_usx_paths",
            {
                paths: ["/tmp/a.usfm"],
                batchOptions: { parallel: true },
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            13,
            "usfm_onion_to_vref_path",
            {
                path: "/tmp/a.usfm",
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            14,
            "usfm_onion_to_vref_paths",
            {
                paths: ["/tmp/a.usfm"],
                batchOptions: { parallel: true },
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            15,
            "usfm_onion_diff_paths",
            {
                baselinePath: "/tmp/a.usfm",
                currentPath: "/tmp/b.usfm",
                tokenOptions: {},
                buildOptions: {},
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            16,
            "usfm_onion_diff_paths_by_chapter",
            {
                baselinePath: "/tmp/a.usfm",
                currentPath: "/tmp/b.usfm",
                tokenOptions: {},
                buildOptions: {},
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            17,
            "usfm_onion_diff_path_pairs",
            {
                pathPairs: [
                    { baselinePath: "/tmp/a.usfm", currentPath: "/tmp/b.usfm" },
                ],
                tokenOptions: {},
                buildOptions: {},
                batchOptions: { parallel: true },
            },
        );
        expect(invokeMock).toHaveBeenNthCalledWith(
            18,
            "usfm_onion_diff_path_pairs",
            {
                pathPairs: [
                    { baselinePath: "/tmp/a.usfm", currentPath: "/tmp/b.usfm" },
                ],
                tokenOptions: {},
                buildOptions: {},
                batchOptions: { parallel: true },
            },
        );
    });
});

describe("WebUsfmOnionService path I/O", () => {
    it("marks path I/O as unsupported", () => {
        const service = new WebUsfmOnionService();
        expect(service.supportsPathIo).toBe(false);
    });

    it("throws explicit unsupported errors for path APIs", async () => {
        const service = new WebUsfmOnionService();
        await expect(
            service.projectUsfmFromPath("/tmp/a.usfm"),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(
            service.projectUsfmBatchFromPaths(["/tmp/a.usfm"]),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(service.tokensFromPath("/tmp/a.usfm")).rejects.toThrow(
            "Path I/O is desktop-only",
        );
        await expect(service.lintPath("/tmp/a.usfm")).rejects.toThrow(
            "Path I/O is desktop-only",
        );
        await expect(
            service.lintBatchFromPaths(["/tmp/a.usfm"]),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(
            service.lintScope([{ path: "/tmp/a.usfm" }]),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(
            service.formatBatchFromPaths(["/tmp/a.usfm"]),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(
            service.formatScope([{ path: "/tmp/a.usfm" }]),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(service.toUsjFromPath("/tmp/a.usfm")).rejects.toThrow(
            "Path I/O is desktop-only",
        );
        await expect(
            service.toUsjBatchFromPaths(["/tmp/a.usfm"]),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(service.toUsxFromPath("/tmp/a.usfm")).rejects.toThrow(
            "Path I/O is desktop-only",
        );
        await expect(
            service.toUsxBatchFromPaths(["/tmp/a.usfm"]),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(service.toVrefFromPath("/tmp/a.usfm")).rejects.toThrow(
            "Path I/O is desktop-only",
        );
        await expect(
            service.toVrefBatchFromPaths(["/tmp/a.usfm"]),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(
            service.diffPaths("/tmp/a.usfm", "/tmp/b.usfm"),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(
            service.diffPathsByChapter("/tmp/a.usfm", "/tmp/b.usfm"),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(
            service.diffBatchFromPathPairs([
                { baselinePath: "/tmp/a.usfm", currentPath: "/tmp/b.usfm" },
            ]),
        ).rejects.toThrow("Path I/O is desktop-only");
        await expect(
            service.diffScope([
                { baselinePath: "/tmp/a.usfm", currentPath: "/tmp/b.usfm" },
            ]),
        ).rejects.toThrow("Path I/O is desktop-only");
    });
});
