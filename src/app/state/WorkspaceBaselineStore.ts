// WorkspaceBaselineStore.ts
//
// Tracks what the on-disk USFM looked like for each book — the "baseline" the
// crash-recovery system compares against. A dirty-buffer backup records the
// baseline that was current when it was written; at reopen we compare that
// recorded baseline to what disk holds now to decide whether a restored chapter
// needs forced review (disk moved underneath the backup) or can be restored
// silently (disk unchanged).
//
// This store owns the shared MD5 service so the rest of the crash-recovery code
// has one place to ask "hash this content" and "what's the baseline for book X".

import type { DiskBaseline } from "@/app/state/DirtyBufferStore.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";

export class WorkspaceBaselineStore {
    private readonly baselines = new Map<string, DiskBaseline>();

    constructor(private readonly md5: IMd5Service) {}

    /** Default `absent` for books we have never seen persisted. */
    getBaseline(bookCode: string): DiskBaseline {
        return this.baselines.get(bookCode) ?? { kind: "absent" };
    }

    computeMd5(content: string): Promise<string> {
        return this.md5.calculateMd5(content);
    }

    /**
     * Record that `bookCode` is persisted with the given checksum. Synchronous on
     * purpose: callers precompute the MD5 (which can fail) before any disk write,
     * then call this only after the write succeeds, so the baseline can never
     * claim bytes that did not land.
     */
    setPresent(bookCode: string, precomputedMd5: string): void {
        this.baselines.set(bookCode, { kind: "present", md5: precomputedMd5 });
    }

    setAbsent(bookCode: string): void {
        this.baselines.set(bookCode, { kind: "absent" });
    }

    snapshot(): ReadonlyMap<string, DiskBaseline> {
        return new Map(this.baselines);
    }
}
