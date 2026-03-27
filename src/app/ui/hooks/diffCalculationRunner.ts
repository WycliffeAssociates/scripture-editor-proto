const DEFAULT_LOADING_DELAY_MS = 200;

export type DiffCalculationRunner = {
    run: <T>(work: () => Promise<T>) => Promise<T>;
};

/**
 * Serialize diff-calculation UI state so only the latest request controls the
 * spinner and stale runs cannot turn the indicator back off out of order.
 */
export function createDiffCalculationRunner(args: {
    setIsCalculatingDiffs: (value: boolean) => void;
    delayMs?: number;
}): DiffCalculationRunner {
    const delayMs = args.delayMs ?? DEFAULT_LOADING_DELAY_MS;
    let latestOperationId = 0;
    let loadingTimer: ReturnType<typeof setTimeout> | null = null;

    return {
        run: async <T>(work: () => Promise<T>): Promise<T> => {
            latestOperationId += 1;
            const operationId = latestOperationId;

            if (loadingTimer) {
                clearTimeout(loadingTimer);
                loadingTimer = null;
            }

            loadingTimer = setTimeout(() => {
                if (latestOperationId !== operationId) return;
                args.setIsCalculatingDiffs(true);
            }, delayMs);

            try {
                return await work();
            } finally {
                if (latestOperationId === operationId) {
                    if (loadingTimer) {
                        clearTimeout(loadingTimer);
                        loadingTimer = null;
                    }
                    args.setIsCalculatingDiffs(false);
                }
            }
        },
    };
}

/**
 * Yield between diff batches so long-running compare work does not freeze the
 * workspace UI on large scripture sets.
 */
export async function yieldToMainThread(): Promise<void> {
    await new Promise<void>((resolve) => {
        if (
            typeof window !== "undefined" &&
            typeof window.requestAnimationFrame === "function"
        ) {
            window.requestAnimationFrame(() => resolve());
            return;
        }
        setTimeout(() => resolve(), 0);
    });
}
