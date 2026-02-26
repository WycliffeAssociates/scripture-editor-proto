const DEFAULT_LOADING_DELAY_MS = 200;

export type DiffCalculationRunner = {
    run: <T>(work: () => Promise<T>) => Promise<T>;
};

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
