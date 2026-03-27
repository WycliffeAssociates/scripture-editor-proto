import type { LexicalEditor } from "lexical";
import { useState } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import { applyVersionSnapshotToWorkingFiles } from "@/app/domain/project/versionNavigationService.ts";
import { snapshotToScriptureBookStates } from "@/app/domain/project/versionSnapshotAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type {
    GitProvider,
    VersionEntry,
} from "@/core/persistence/GitProvider.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import { syncEditorToPickedChapter } from "./shared.ts";

const VERSIONS_PAGE_SIZE = 50;

type PendingVersionAction =
    | { type: "open" }
    | { type: "switch"; hash: string }
    | { type: "latest" };

/**
 * Version-history hook for the current editable scripture workspace.
 *
 * It pages git history, loads prior snapshots into scripture workspace state,
 * and coordinates the "discard unsaved changes first" prompts that appear when
 * the user tries to view older versions mid-edit.
 */
export function useVersionHistory(args: {
    loadedProject: Project;
    gitProvider: GitProvider;
    mutWorkingFilesRef: ScriptureBookState[];
    pickedFile: ScriptureBookState | null;
    pickedChapter: ScriptureChapterState | null;
    editorRef: React.RefObject<LexicalEditor | null>;
    history: CustomHistoryHook;
    editorMode: EditorModeSetting;
    usfmOnionService: IUsfmOnionService;
    bumpDirtyVersion: () => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [entries, setEntries] = useState<VersionEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [offset, setOffset] = useState(0);
    const [latestHash, setLatestHash] = useState<string | null>(null);
    const [selectedHash, setSelectedHash] = useState<string | null>(null);
    const [isDirtyPromptOpen, setIsDirtyPromptOpen] = useState(false);
    const [pendingAction, setPendingAction] =
        useState<PendingVersionAction | null>(null);

    const isViewingOlderVersion = Boolean(
        selectedHash && latestHash && selectedHash !== latestHash,
    );

    async function applyHash(hash: string) {
        const snapshot = await args.gitProvider.readProjectSnapshotAtCommit(
            args.loadedProject.projectPath,
            hash,
        );
        const sourceFiles = await snapshotToScriptureBookStates({
            loadedProject: args.loadedProject,
            snapshot,
            editorMode: args.editorMode,
            usfmOnionService: args.usfmOnionService,
        });
        await args.history.runTransaction({
            label: "Load Previous Version",
            candidates: args.mutWorkingFilesRef.flatMap((file) =>
                file.chapters.map((chapter) => ({
                    bookCode: file.bookCode,
                    chapterNum: chapter.chapterNumber,
                })),
            ),
            run: async () => {
                applyVersionSnapshotToWorkingFiles({
                    workingFiles: args.mutWorkingFilesRef,
                    sourceFiles,
                });
                syncEditorToPickedChapter({
                    editorRef: args.editorRef,
                    workingFiles: args.mutWorkingFilesRef,
                    pickedFile: args.pickedFile,
                    pickedChapter: args.pickedChapter,
                });
                args.bumpDirtyVersion();
            },
        });
        args.history.clearHistory();
        setSelectedHash(hash);
    }

    async function refresh() {
        setIsLoading(true);
        try {
            const next = await args.gitProvider.listHistory(
                args.loadedProject.projectPath,
                {
                    limit: VERSIONS_PAGE_SIZE,
                    offset: 0,
                },
            );
            setEntries(next);
            setOffset(next.length);
            const nextLatestHash = next[0]?.hash ?? null;
            setLatestHash(nextLatestHash);
            setSelectedHash((prev) => {
                if (!nextLatestHash) return null;
                if (!prev) return nextLatestHash;
                return next.some((entry) => entry.hash === prev)
                    ? prev
                    : nextLatestHash;
            });
        } finally {
            setIsLoading(false);
        }
    }

    async function ensureLoaded() {
        if (entries.length > 0) return;
        await refresh();
    }

    async function loadMore() {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const next = await args.gitProvider.listHistory(
                args.loadedProject.projectPath,
                {
                    limit: VERSIONS_PAGE_SIZE,
                    offset,
                },
            );
            setEntries((prev) => [...prev, ...next]);
            setOffset((prev) => prev + next.length);
        } finally {
            setIsLoading(false);
        }
    }

    function close() {
        setIsOpen(false);
    }

    async function open(args2: {
        saveCurrentDirtyLexical: () => void;
        hasUnsavedChanges: boolean;
    }) {
        args2.saveCurrentDirtyLexical();
        if (args2.hasUnsavedChanges) {
            setPendingAction({ type: "open" });
            setIsDirtyPromptOpen(true);
            return;
        }
        await refresh();
        setIsOpen(true);
    }

    async function select(args2: {
        hash: string;
        saveCurrentDirtyLexical: () => void;
        hasUnsavedChanges: boolean;
    }) {
        if (!args2.hash || args2.hash === selectedHash) return;
        args2.saveCurrentDirtyLexical();
        if (args2.hasUnsavedChanges) {
            setPendingAction({ type: "switch", hash: args2.hash });
            setIsDirtyPromptOpen(true);
            return;
        }
        await applyHash(args2.hash);
    }

    async function backToLatest(args2: {
        saveCurrentDirtyLexical: () => void;
        hasUnsavedChanges: boolean;
    }) {
        if (!latestHash || selectedHash === latestHash) return;
        args2.saveCurrentDirtyLexical();
        if (args2.hasUnsavedChanges) {
            setPendingAction({ type: "latest" });
            setIsDirtyPromptOpen(true);
            return;
        }
        await applyHash(latestHash);
    }

    function dismissDirtyPrompt() {
        setIsDirtyPromptOpen(false);
        setPendingAction(null);
    }

    async function discardAndContinue(
        discardUnsavedChanges: () => Promise<void>,
    ) {
        const action = pendingAction;
        dismissDirtyPrompt();
        await discardUnsavedChanges();
        if (!action) return;
        if (action.type === "open") {
            await refresh();
            setIsOpen(true);
            return;
        }
        if (action.type === "switch") {
            await applyHash(action.hash);
            return;
        }
        if (action.type === "latest" && latestHash) {
            await applyHash(latestHash);
        }
    }

    function saveAndContinue(openSaveReview: () => void) {
        dismissDirtyPrompt();
        setIsOpen(false);
        openSaveReview();
    }

    return {
        state: {
            isOpen,
            entries,
            isLoading,
            latestHash,
            selectedHash,
            isViewingOlderVersion,
            isDirtyPromptOpen,
        },
        actions: {
            open,
            close,
            refresh,
            ensureLoaded,
            loadMore,
            select,
            backToLatest,
            dismissDirtyPrompt,
            discardAndContinue,
            saveAndContinue,
            setLatestHash,
            setSelectedHash,
        },
    };
}
