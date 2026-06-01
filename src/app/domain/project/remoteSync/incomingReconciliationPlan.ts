import type {
    DiffsByChapter,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import type { ChapterRef } from "@/app/domain/project/workingFileMutations.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";

export type DirtySemanticSidMap = Map<string, Set<string>>;

export function hasDiffsByChapter(
    diffsByChapter: DiffsByChapter | null | undefined,
) {
    if (!diffsByChapter) return false;
    return Object.values(diffsByChapter).some((book) =>
        Object.values(book).some((chapterDiffs) => chapterDiffs.length > 0),
    );
}

export function listChangedChapterRefs(
    diffsByChapter: DiffsByChapter,
): ChapterRef[] {
    const refs: ChapterRef[] = [];
    for (const [bookCode, chapters] of Object.entries(diffsByChapter)) {
        for (const [chapterKey, chapterDiffs] of Object.entries(chapters)) {
            const chapterNum = Number(chapterKey);
            if (Number.isNaN(chapterNum) || chapterDiffs.length === 0) continue;
            refs.push({ bookCode, chapterNum });
        }
    }
    return refs;
}

export function buildChapterKey(bookCode: string, chapterNum: number) {
    return `${bookCode}:${chapterNum}`;
}

export function splitRemoteDiffsByDirtySemanticSid(args: {
    diffsByChapter: DiffsByChapter;
    dirtySemanticSidsByChapter: DirtySemanticSidMap;
}) {
    const blockedDiffsByChapter: DiffsByChapter = {};
    const autoAcceptedDiffs: ProjectDiff[] = [];

    for (const [bookCode, chapters] of Object.entries(args.diffsByChapter)) {
        const blockedBook: Record<number, ProjectDiff[]> = {};
        for (const [chapterKey, chapterDiffs] of Object.entries(chapters)) {
            const chapterNum = Number(chapterKey);
            if (Number.isNaN(chapterNum)) continue;
            const dirtySemanticSids =
                args.dirtySemanticSidsByChapter.get(
                    buildChapterKey(bookCode, chapterNum),
                ) ?? new Set<string>();
            const blockedDiffs = chapterDiffs.filter((diff) =>
                dirtySemanticSids.has(diff.semanticSid),
            );
            const safeDiffs = chapterDiffs.filter(
                (diff) => !dirtySemanticSids.has(diff.semanticSid),
            );
            if (blockedDiffs.length) {
                blockedBook[chapterNum] = blockedDiffs;
            }
            autoAcceptedDiffs.push(...safeDiffs);
        }

        if (Object.keys(blockedBook).length) {
            blockedDiffsByChapter[bookCode] = blockedBook;
        }
    }

    return {
        blockedDiffsByChapter,
        autoAcceptedDiffs,
    };
}

export function buildAutoAcceptIncomingPlan(args: {
    initialDiffsByChapter: DiffsByChapter;
    blockedDiffsByChapter: DiffsByChapter;
}) {
    const blockedByChapter = new Map<string, Set<string>>();
    for (const [bookCode, chapters] of Object.entries(
        args.blockedDiffsByChapter,
    )) {
        for (const [chapterKey, chapterDiffs] of Object.entries(chapters)) {
            const chapterNum = Number(chapterKey);
            if (Number.isNaN(chapterNum)) continue;
            blockedByChapter.set(
                buildChapterKey(bookCode, chapterNum),
                new Set(chapterDiffs.map((diff) => diff.uniqueKey)),
            );
        }
    }

    const fullChapterApplies: ChapterRef[] = [];
    const hunkApplies: ProjectDiff[] = [];

    for (const [bookCode, chapters] of Object.entries(
        args.initialDiffsByChapter,
    )) {
        for (const [chapterKey, chapterDiffs] of Object.entries(chapters)) {
            const chapterNum = Number(chapterKey);
            if (Number.isNaN(chapterNum) || chapterDiffs.length === 0) continue;
            const blockedUniqueKeys = blockedByChapter.get(
                buildChapterKey(bookCode, chapterNum),
            );
            if (!blockedUniqueKeys || blockedUniqueKeys.size === 0) {
                fullChapterApplies.push({ bookCode, chapterNum });
                continue;
            }
            for (const diff of chapterDiffs) {
                if (!blockedUniqueKeys.has(diff.uniqueKey)) {
                    hunkApplies.push(diff);
                }
            }
        }
    }

    return {
        fullChapterApplies,
        hunkApplies,
    };
}

export function extractBookCodeFromStorageKey(
    storageKey: string,
): string | null {
    if (!storageKey.endsWith(".usfm")) return null;
    const fileName = storageKey.split("/").pop() ?? storageKey;
    const withDashMatch = fileName.match(/-([A-Za-z0-9]{3})\.usfm$/);
    if (withDashMatch?.[1]) {
        return withDashMatch[1].toUpperCase();
    }
    const plainMatch = fileName.match(/^([A-Za-z0-9]{3})\.usfm$/);
    if (plainMatch?.[1]) {
        return plainMatch[1].toUpperCase();
    }
    return null;
}

export function buildBookTextByCodeFromSnapshot(snapshot: Map<string, string>) {
    const byBook = new Map<string, string>();
    for (const [storageKey, text] of snapshot.entries()) {
        const bookCode = extractBookCodeFromStorageKey(storageKey);
        if (!bookCode) continue;
        byBook.set(bookCode, text);
    }
    return byBook;
}

export function buildBookTextByCodeFromScriptureFiles(
    files: ScriptureBookState[],
) {
    const byBook = new Map<string, string>();
    for (const file of files) {
        let usfmText = "";
        for (const chapter of file.chapters) {
            for (const token of chapter.currentTokens) {
                usfmText += "source" in token ? String(token.source ?? "") : "";
            }
        }
        byBook.set(file.bookCode.toUpperCase(), usfmText);
    }
    return byBook;
}

export function collectChangedBookCodes(args: {
    baseByBook: Map<string, string>;
    targetByBook: Map<string, string>;
}) {
    const keys = new Set([
        ...Array.from(args.baseByBook.keys()),
        ...Array.from(args.targetByBook.keys()),
    ]);
    const changed = new Set<string>();
    for (const bookCode of keys) {
        const baseText = args.baseByBook.get(bookCode) ?? null;
        const targetText = args.targetByBook.get(bookCode) ?? null;
        if (baseText !== targetText) {
            changed.add(bookCode);
        }
    }
    return changed;
}
