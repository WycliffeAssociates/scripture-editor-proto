import type { ProjectDiff } from "@/app/domain/project/diffTypes.ts";

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
