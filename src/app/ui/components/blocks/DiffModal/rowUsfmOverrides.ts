import type { ProjectDiff } from "@/app/domain/project/diffTypes.ts";

/**
 * Per-row USFM visibility overrides for the diff list.
 *
 * The diff modal has a global “show markers” toggle, but users sometimes need
 * to inspect one row in USFM without switching the entire modal. This tiny state
 * helper keeps that override logic out of the renderer.
 */
export type RowUsfmOverrides = Record<string, boolean>;

export function getRowUsfmOverrideKey(diff: ProjectDiff): string {
    return diff.uniqueKey || diff.semanticSid;
}

export function resolveRowUsfmMode(args: {
    globalShowUsfmMarkers: boolean;
    overrides: RowUsfmOverrides;
    rowKey: string;
}): boolean {
    const local = args.overrides[args.rowKey];
    return local ?? args.globalShowUsfmMarkers;
}

export function toggleRowUsfmOverride(args: {
    globalShowUsfmMarkers: boolean;
    overrides: RowUsfmOverrides;
    rowKey: string;
}): RowUsfmOverrides {
    const effective = resolveRowUsfmMode({
        globalShowUsfmMarkers: args.globalShowUsfmMarkers,
        overrides: args.overrides,
        rowKey: args.rowKey,
    });
    return {
        ...args.overrides,
        [args.rowKey]: !effective,
    };
}
