import { describe, expect, it, vi } from "vitest";
import { createDiffCalculationRunner } from "@/app/ui/hooks/diffCalculationRunner.ts";

describe("createDiffCalculationRunner", () => {
    it("does not show loader if operation completes before delay", async () => {
        vi.useFakeTimers();
        const updates: boolean[] = [];
        const runner = createDiffCalculationRunner({
            setIsCalculatingDiffs: (value) => updates.push(value),
            delayMs: 200,
        });

        await runner.run(async () => {
            await vi.advanceTimersByTimeAsync(199);
            return "done";
        });

        expect(updates).toEqual([false]);
        vi.useRealTimers();
    });

    it("shows loader after delay and hides it when operation completes", async () => {
        vi.useFakeTimers();
        const updates: boolean[] = [];
        const runner = createDiffCalculationRunner({
            setIsCalculatingDiffs: (value) => updates.push(value),
            delayMs: 200,
        });

        const op = runner.run(async () => {
            await vi.advanceTimersByTimeAsync(201);
            await vi.advanceTimersByTimeAsync(10);
            return "done";
        });

        await op;

        expect(updates).toEqual([true, false]);
        vi.useRealTimers();
    });

    it("ignores stale completion from an older overlapping operation", async () => {
        vi.useFakeTimers();
        const updates: boolean[] = [];
        const runner = createDiffCalculationRunner({
            setIsCalculatingDiffs: (value) => updates.push(value),
            delayMs: 200,
        });

        let resolveFirst: () => void = () => {};
        const first = runner.run(
            () =>
                new Promise<void>((resolve) => {
                    resolveFirst = resolve;
                }),
        );
        const second = runner.run(async () => {
            await vi.advanceTimersByTimeAsync(201);
        });

        resolveFirst();
        await first;
        await second;

        expect(updates).toEqual([true, false]);
        vi.useRealTimers();
    });
});
