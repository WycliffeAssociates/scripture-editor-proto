import type {
    BranchInfo,
    CommitOperation,
} from "@/core/persistence/GitProvider.ts";

type ParseAppCommitMetadataArgs = {
    subject: string;
    body?: string;
};

type ParsedAppCommitMetadata = {
    isAppCommit: boolean;
    isExternal: boolean;
    op?: CommitOperation;
    chapterSummary?: string[];
};

function parseTrailers(body: string): Map<string, string> {
    const trailers = new Map<string, string>();
    const lines = body.split(/\r?\n/u);
    for (const line of lines) {
        const separator = line.indexOf(":");
        if (separator <= 0) continue;
        const key = line.slice(0, separator).trim().toLowerCase();
        const value = line.slice(separator + 1).trim();
        if (!key || !value) continue;
        trailers.set(key, value);
    }
    return trailers;
}

function parseCommitOp(subject: string): CommitOperation | undefined {
    if (subject.startsWith("save:")) return "save";
    if (subject.startsWith("baseline:")) return "baseline";
    return undefined;
}

export function parseAppCommitMetadata(
    args: ParseAppCommitMetadataArgs,
): ParsedAppCommitMetadata {
    const op = parseCommitOp(args.subject);
    if (!op) {
        return { isAppCommit: false, isExternal: true };
    }

    const trailers = parseTrailers(args.body ?? "");
    const trailerVersion = trailers.get("x-dovetail-version");
    const trailerOp = trailers.get("x-dovetail-op");
    const chapterSummaryRaw = trailers.get("x-dovetail-chapters");

    const isAppCommit = trailerVersion === "1" && trailerOp === op;

    if (!isAppCommit) {
        return { isAppCommit: false, isExternal: true };
    }

    const chapterSummary =
        chapterSummaryRaw
            ?.split("|")
            .map((item) => item.trim())
            .filter(Boolean) ?? [];

    return {
        isAppCommit: true,
        isExternal: false,
        op,
        chapterSummary: chapterSummary.length > 0 ? chapterSummary : undefined,
    };
}

export function formatChapterSummary(chapters: string[]): string {
    if (chapters.length === 0) return "";
    if (chapters.length <= 3) return chapters.join(", ");
    const firstThree = chapters.slice(0, 3).join(", ");
    const remaining = chapters.length - 3;
    return `${firstThree} +${remaining} more`;
}

export function resolvePreferredBranch(
    args: BranchInfo & { prefer: "master" },
) {
    if (args.prefer === "master" && args.hasMaster) return "master";
    if (args.defaultBranch) return args.defaultBranch;
    return args.current;
}

export function buildCommitMessage(args: {
    op: CommitOperation;
    timestampIso: string;
    changedChapters: string[];
}): string {
    const subject = `${args.op}:${args.timestampIso}`;
    const trailers = [
        `x-dovetail-op: ${args.op}`,
        `x-dovetail-chapters: ${args.changedChapters.join("|")}`,
        "x-dovetail-version: 1",
    ];
    return [subject, "", ...trailers].join("\n");
}
