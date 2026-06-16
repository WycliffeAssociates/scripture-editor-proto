// retryBackupWrite.ts
//
// Bounded exponential retry around a crash-recovery backup write. A backup is a
// safety net, so a transient OPFS/FS hiccup must not lose it silently: the write
// is retried a few times (immediate, then exponential backoff) before giving up.
// On exhaust the caller logs loudly and leaves the book dormant until its next
// commit re-triggers a write — a failure never tears anything down.

/** Attempts AFTER the first (3 total: immediate, +base, +2·base). */
const RETRY_TIMES = 2;
const RETRY_BASE_MS = 2_000;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `write`, retrying up to `RETRY_TIMES` more times with exponential
 * backoff. Rethrows the last error if every attempt fails, so the caller owns
 * the loud-log-and-stay-dormant decision.
 */
export async function retryBackupWrite<T>(write: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_TIMES; attempt++) {
    try {
      return await write();
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_TIMES) await delay(RETRY_BASE_MS * 2 ** attempt);
    }
  }
  throw lastError;
}
