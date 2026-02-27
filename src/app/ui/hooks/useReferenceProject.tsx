import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { projectParamToParsedFiles } from "@/app/domain/api/projectToParsed.tsx";
import type { ProjectFingerprintService } from "@/app/domain/cache/ProjectFingerprintService.ts";
import type { ProjectWarmCacheProvider } from "@/app/domain/cache/ProjectWarmCacheProvider.ts";
import { parseReference } from "@/core/data/bible/bible.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";

export type ReferenceProjectHook = ReturnType<typeof useReferenceProject>;

type Props = {
    projectRepository: IProjectRepository;
    pickedFileIdentifier: string;
    pickedChapterNumber: number;
    projectWarmCacheProvider: ProjectWarmCacheProvider;
    projectFingerprintService: ProjectFingerprintService;
};
export const useReferenceProject = ({
    projectRepository,
    pickedFileIdentifier,
    pickedChapterNumber,
    projectWarmCacheProvider,
    projectFingerprintService,
}: Props) => {
    const [referenceProjectId, setReferenceProjectId] = useState<string>();
    const [referenceBookCode, setReferenceBookCode] =
        useState(pickedFileIdentifier);
    const [referenceChapterNumber, setReferenceChapterNumber] =
        useState(pickedChapterNumber);
    const [isReferenceNavSynced, setIsReferenceNavSynced] = useState(true);
    const [isReferenceScrollSynced, setIsReferenceScrollSynced] =
        useState(false);
    const { md5Service, gitProvider, settingsManager } =
        useRouter().options.context;
    const editorMode = settingsManager.get("editorMode");
    const referenceProjectQuery = useQuery({
        queryKey: ["projectFiles", referenceProjectId, editorMode],
        queryFn: () =>
            projectParamToParsedFiles(
                projectRepository,
                referenceProjectId,
                md5Service,
                gitProvider,
                projectWarmCacheProvider,
                projectFingerprintService,
                editorMode,
            ),
        enabled: !!referenceProjectId,
    });
    useEffect(() => {
        if (!isReferenceNavSynced) return;
        setReferenceBookCode(pickedFileIdentifier);
        setReferenceChapterNumber(pickedChapterNumber);
    }, [isReferenceNavSynced, pickedChapterNumber, pickedFileIdentifier]);

    const parsedFiles = referenceProjectQuery.data?.parsedFiles ?? [];
    const effectiveReferenceBookCode = isReferenceNavSynced
        ? pickedFileIdentifier
        : referenceBookCode;
    const effectiveReferenceChapterNumber = isReferenceNavSynced
        ? pickedChapterNumber
        : referenceChapterNumber;

    function switchReferenceBookOrChapter(bookCode: string, chapter: number) {
        const targetFile = parsedFiles.find((f) => f.bookCode === bookCode);
        if (!targetFile) return;

        const chapterExists = targetFile.chapters.some(
            (chap) => chap.chapNumber === chapter,
        );
        const fallbackChapter = targetFile.chapters[0]?.chapNumber;
        const nextChapter = chapterExists ? chapter : fallbackChapter;
        if (nextChapter === undefined) return;

        setReferenceBookCode(bookCode);
        setReferenceChapterNumber(nextChapter);
    }

    function goToReferenceInReference(input: string): boolean {
        const parsed = parseReference(input);
        if (!parsed) return false;

        let matchedFile = parsed.knownBookId
            ? parsedFiles.find(
                  (f) =>
                      f.bookCode.toLowerCase() ===
                      parsed.knownBookId?.toLowerCase(),
              )
            : undefined;
        if (!matchedFile) {
            const parsedBookMatch = parsed.bookMatch.toLowerCase();
            const startsWithMatches = parsedFiles.filter(
                (file) =>
                    file.title?.toLowerCase().startsWith(parsedBookMatch) ||
                    file.bookCode.toLowerCase().startsWith(parsedBookMatch),
            );
            if (startsWithMatches.length === 1) {
                matchedFile = startsWithMatches[0];
            }
        }
        if (!matchedFile) return false;

        const targetChapter =
            parsed.chapter ?? effectiveReferenceChapterNumber ?? 0;
        switchReferenceBookOrChapter(matchedFile.bookCode, targetChapter);
        return true;
    }

    const referenceFile = useMemo(() => {
        return referenceProjectQuery.data?.parsedFiles.find(
            (f) => f.bookCode === effectiveReferenceBookCode,
        );
    }, [effectiveReferenceBookCode, referenceProjectQuery.data]);
    const referenceChapter = useMemo(() => {
        return referenceFile?.chapters.find(
            (chapter) => chapter.chapNumber === effectiveReferenceChapterNumber,
        );
    }, [effectiveReferenceChapterNumber, referenceFile]);

    const nextReferenceLocation = useMemo(() => {
        if (!referenceFile || referenceFile.chapters.length === 0) {
            return null;
        }

        const sortedChapters = [...referenceFile.chapters].sort(
            (a, b) => a.chapNumber - b.chapNumber,
        );
        const currentIndex = sortedChapters.findIndex(
            (chapter) => chapter.chapNumber === effectiveReferenceChapterNumber,
        );
        if (currentIndex >= 0 && currentIndex < sortedChapters.length - 1) {
            return {
                bookCode: referenceFile.bookCode,
                chapterNumber: sortedChapters[currentIndex + 1].chapNumber,
            };
        }

        const nextBookId = referenceFile.nextBookId;
        if (!nextBookId) return null;
        const nextBook = parsedFiles.find(
            (file) => file.bookCode === nextBookId,
        );
        if (!nextBook || nextBook.chapters.length === 0) return null;

        const firstChapter = [...nextBook.chapters].sort(
            (a, b) => a.chapNumber - b.chapNumber,
        )[0]?.chapNumber;
        if (firstChapter === undefined) return null;
        return { bookCode: nextBook.bookCode, chapterNumber: firstChapter };
    }, [effectiveReferenceChapterNumber, parsedFiles, referenceFile]);

    const prevReferenceLocation = useMemo(() => {
        if (!referenceFile || referenceFile.chapters.length === 0) {
            return null;
        }

        const sortedChapters = [...referenceFile.chapters].sort(
            (a, b) => a.chapNumber - b.chapNumber,
        );
        const currentIndex = sortedChapters.findIndex(
            (chapter) => chapter.chapNumber === effectiveReferenceChapterNumber,
        );
        if (currentIndex > 0) {
            return {
                bookCode: referenceFile.bookCode,
                chapterNumber: sortedChapters[currentIndex - 1].chapNumber,
            };
        }

        const prevBookId = referenceFile.prevBookId;
        if (!prevBookId) return null;
        const prevBook = parsedFiles.find(
            (file) => file.bookCode === prevBookId,
        );
        if (!prevBook || prevBook.chapters.length === 0) return null;

        const lastChapter = [...prevBook.chapters].sort(
            (a, b) => b.chapNumber - a.chapNumber,
        )[0]?.chapNumber;
        if (lastChapter === undefined) return null;
        return { bookCode: prevBook.bookCode, chapterNumber: lastChapter };
    }, [effectiveReferenceChapterNumber, parsedFiles, referenceFile]);

    function goToNextReferenceChapter() {
        if (!nextReferenceLocation) return;
        switchReferenceBookOrChapter(
            nextReferenceLocation.bookCode,
            nextReferenceLocation.chapterNumber,
        );
    }

    function goToPrevReferenceChapter() {
        if (!prevReferenceLocation) return;
        switchReferenceBookOrChapter(
            prevReferenceLocation.bookCode,
            prevReferenceLocation.chapterNumber,
        );
    }

    function setReferenceNavigationSynced(enabled: boolean) {
        setIsReferenceNavSynced(enabled);
        if (!enabled) {
            setIsReferenceScrollSynced(false);
            return;
        }
        setReferenceBookCode(pickedFileIdentifier);
        setReferenceChapterNumber(pickedChapterNumber);
    }

    function setReferenceScrollingSynced(enabled: boolean) {
        if (!isReferenceNavSynced) return;
        setIsReferenceScrollSynced(enabled);
    }

    function setReferenceProjectIdWithReset(projectId: string | undefined) {
        setReferenceProjectId(projectId);
        if (!projectId) {
            setIsReferenceNavSynced(true);
            setIsReferenceScrollSynced(false);
            setReferenceBookCode(pickedFileIdentifier);
            setReferenceChapterNumber(pickedChapterNumber);
        }
    }

    return {
        referenceQuery: referenceProjectQuery,
        referenceFile,
        referenceChapter,
        parsedFiles,
        referenceBookCode: effectiveReferenceBookCode,
        referenceChapterNumber: effectiveReferenceChapterNumber,
        switchReferenceBookOrChapter,
        goToReferenceInReference,
        hasNextReferenceChapter: Boolean(nextReferenceLocation),
        hasPrevReferenceChapter: Boolean(prevReferenceLocation),
        goToNextReferenceChapter,
        goToPrevReferenceChapter,
        isReferenceNavSynced,
        isReferenceScrollSynced,
        setReferenceNavigationSynced,
        setReferenceScrollingSynced,
        setReferenceProjectId: setReferenceProjectIdWithReset,
        referenceProjectId,
    };
};

export type ReferenceProject = ReturnType<typeof useReferenceProject>;
