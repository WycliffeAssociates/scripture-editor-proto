import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import {
  type EditorModeSetting,
  type EditorShape,
  shapeForSurface,
} from "@/app/data/editor.ts";
import { projectParamToParsedScripture } from "@/app/domain/api/projectToParsed.tsx";
import type { LibraryService } from "@/app/library/LibraryService.ts";
import { loadTranslationNotesForAnchor } from "@/app/reference/translationNotes.ts";
import { parseReference } from "@/core/data/bible/bible.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import {
  isTranslationNotesItem,
  isUsfmScriptureItem,
  type TranslationNotesItem,
} from "@/core/library/LibraryItem.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";

export type ReferenceItemHook = ReturnType<typeof useReferenceItem>;

type ReferenceProjectsService = Pick<ProjectsService, "listReferenceResources">;

type Props = {
  projectsService: ReferenceProjectsService;
  libraryService: LibraryService;
  fileSystem: FileSystem;
  pickedFileIdentifier: string;
  pickedChapterNumber: number;
  editorMode: EditorModeSetting;
  gitProvider: GitProvider;
};

async function loadReferenceResourceByPath(args: {
  libraryService: LibraryService;
  resourcePath: string;
}) {
  const result = await args.libraryService.openItem(args.resourcePath);
  if (!result) {
    throw new Error(`Failed to load reference resource: ${args.resourcePath}`);
  }
  return result;
}

async function loadReferenceScriptureByPath(args: {
  libraryService: LibraryService;
  resourcePath: string;
  fileSystem: FileSystem;
  gitProvider: GitProvider;
  shape: EditorShape;
  usfmOnionService: IUsfmOnionService;
}) {
  const item = await loadReferenceResourceByPath({
    libraryService: args.libraryService,
    resourcePath: args.resourcePath,
  });
  if (!isUsfmScriptureItem(item)) {
    throw new Error(
      `Failed to load scripture reference resource: ${args.resourcePath}`,
    );
  }
  return projectParamToParsedScripture({
    openProjectReadOnly: async () => item,
    project: args.resourcePath,
    fileSystem: args.fileSystem,
    gitProvider: args.gitProvider,
    shape: args.shape,
    usfmOnionService: args.usfmOnionService,
  });
}

function useActiveReferenceResourceQuery(args: {
  activeReferenceResourcePath: string | undefined;
  libraryService: LibraryService;
}) {
  return useQuery({
    queryKey: ["referenceResource", args.activeReferenceResourcePath],
    queryFn: async () =>
      loadReferenceResourceByPath({
        libraryService: args.libraryService,
        resourcePath: args.activeReferenceResourcePath ?? "",
      }),
    enabled: !!args.activeReferenceResourcePath,
  });
}

function useReferenceScriptureQuery(args: {
  activeReferenceResourcePath: string | undefined;
  supportsScriptureNavigation: boolean;
  shape: EditorShape;
  libraryService: LibraryService;
  fileSystem: FileSystem;
  gitProvider: GitProvider;
  usfmOnionService: IUsfmOnionService;
}) {
  return useQuery({
    queryKey: [
      "referenceScriptureFiles",
      args.activeReferenceResourcePath,
      args.shape,
    ],
    queryFn: async () =>
      loadReferenceScriptureByPath({
        libraryService: args.libraryService,
        resourcePath: args.activeReferenceResourcePath ?? "",
        fileSystem: args.fileSystem,
        gitProvider: args.gitProvider,
        shape: args.shape,
        usfmOnionService: args.usfmOnionService,
      }),
    enabled: Boolean(
      args.activeReferenceResourcePath && args.supportsScriptureNavigation,
    ),
  });
}

/**
 * Loads Translation Notes by anchor/book/chapter using the typed TN noun rather
 * than the older generic resource shape.
 */
function useTranslationNotesReferenceQuery(args: {
  activeReferenceResource: TranslationNotesItem | undefined;
  activeReferenceResourcePath: string | undefined;
  supportsTranslationNotes: boolean;
  effectiveReferenceBookCode: string;
  effectiveReferenceChapterNumber: number;
}) {
  return useQuery({
    queryKey: [
      "referenceTranslationNotes",
      args.activeReferenceResourcePath,
      args.effectiveReferenceBookCode,
      args.effectiveReferenceChapterNumber,
    ],
    queryFn: async () => {
      if (!args.activeReferenceResource) {
        throw new Error("No active reference resource to load notes from.");
      }
      return loadTranslationNotesForAnchor({
        resource: args.activeReferenceResource,
        anchor: {
          bookCode: args.effectiveReferenceBookCode,
          chapterNumber: args.effectiveReferenceChapterNumber,
        },
      });
    },
    enabled: Boolean(
      args.activeReferenceResourcePath &&
      args.supportsTranslationNotes &&
      args.effectiveReferenceBookCode &&
      args.effectiveReferenceChapterNumber > 0,
    ),
  });
}

/**
 * Warm adjacent TN chapters so chapter-to-chapter reference navigation feels
 * immediate once the active book/chapter is known.
 */
function usePrefetchAdjacentTranslationNotes(args: {
  queryClient: ReturnType<typeof useQueryClient>;
  activeReferenceResource: TranslationNotesItem | undefined;
  activeReferenceResourcePath: string | undefined;
  supportsTranslationNotes: boolean;
  effectiveReferenceBookCode: string;
  effectiveReferenceChapterNumber: number;
}) {
  useEffect(() => {
    if (
      !args.activeReferenceResource ||
      !args.supportsTranslationNotes ||
      !args.effectiveReferenceBookCode ||
      args.effectiveReferenceChapterNumber <= 0
    ) {
      return;
    }

    const adjacentChapterNumbers = [
      args.effectiveReferenceChapterNumber - 1,
      args.effectiveReferenceChapterNumber + 1,
    ].filter((chapterNumber) => chapterNumber > 0);

    for (const chapterNumber of adjacentChapterNumbers) {
      const activeReferenceResource = args.activeReferenceResource;
      void args.queryClient.prefetchQuery({
        queryKey: [
          "referenceTranslationNotes",
          args.activeReferenceResourcePath,
          args.effectiveReferenceBookCode,
          chapterNumber,
        ],
        queryFn: async () =>
          loadTranslationNotesForAnchor({
            resource: activeReferenceResource,
            anchor: {
              bookCode: args.effectiveReferenceBookCode,
              chapterNumber,
            },
          }),
      });
    }
  }, [
    args.activeReferenceResource,
    args.activeReferenceResourcePath,
    args.effectiveReferenceBookCode,
    args.effectiveReferenceChapterNumber,
    args.queryClient,
    args.supportsTranslationNotes,
  ]);
}

/**
 * Reference-item hook used by the scripture workspace shell.
 *
 * This hook is where the UI narrows from the generic library/listing world into
 * the two reference shapes it can currently render: read-only scripture and
 * translation notes. Downstream components should consume the resolved state
 * instead of reopening items or branching on lower-level loading concerns.
 */
export const useReferenceItem = ({
  projectsService,
  libraryService,
  fileSystem,
  pickedFileIdentifier,
  pickedChapterNumber,
  editorMode,
  gitProvider,
}: Props) => {
  const queryClient = useQueryClient();
  const [activeReferenceResourcePath, setActiveReferenceResourcePath] =
    useState<string>();
  const [referenceBookCode, setReferenceBookCode] =
    useState(pickedFileIdentifier);
  const [referenceChapterNumber, setReferenceChapterNumber] =
    useState(pickedChapterNumber);
  // The "Sync navigation" toggle was removed from the reference UI; nav-sync
  // is now always on (the reference follows the main editor's book/chapter).
  // The state + setters are retained so the plumbing survives.
  // TODO: delete isReferenceNavSynced and its setter/consumers if we decide we
  // never want a user-facing toggle back.
  const [isReferenceNavSynced, setIsReferenceNavSynced] = useState(true);
  // The "Sync scrolling" toggle was likewise removed; scroll-sync stays off.
  // TODO: delete isReferenceScrollSynced and its setter/consumers if we decide
  // we never want a user-facing toggle back.
  const [isReferenceScrollSynced, setIsReferenceScrollSynced] = useState(false);
  const { usfmOnionService } = useRouter().options.context;
  // Reference scripture materializes (and react-query caches) by SHAPE, so
  // mode flips that share a shape (regular<->view, usfm<->plain) reuse the
  // cached files instead of refetching.
  const referenceShape = shapeForSurface("referencePane", editorMode);

  const referenceResourcesQuery = useQuery({
    queryKey: ["referenceResources"],
    queryFn: async () => projectsService.listReferenceResources(),
  });

  const activeReferenceResourceQuery = useActiveReferenceResourceQuery({
    activeReferenceResourcePath,
    libraryService,
  });

  const activeReferenceResource = activeReferenceResourceQuery.data;
  const supportsScriptureNavigation = Boolean(
    activeReferenceResource && isUsfmScriptureItem(activeReferenceResource),
  );
  const supportsTranslationNotes = Boolean(
    activeReferenceResource && isTranslationNotesItem(activeReferenceResource),
  );
  const supportsReferenceAnchors =
    supportsScriptureNavigation || supportsTranslationNotes;

  const referenceScriptureQuery = useReferenceScriptureQuery({
    activeReferenceResourcePath,
    supportsScriptureNavigation,
    shape: referenceShape,
    libraryService,
    fileSystem,
    gitProvider,
    usfmOnionService: usfmOnionService as IUsfmOnionService,
  });

  useEffect(() => {
    if (!isReferenceNavSynced || !supportsReferenceAnchors) return;
    setReferenceBookCode(pickedFileIdentifier);
    setReferenceChapterNumber(pickedChapterNumber);
  }, [
    isReferenceNavSynced,
    pickedChapterNumber,
    pickedFileIdentifier,
    supportsReferenceAnchors,
  ]);

  const parsedFiles = supportsScriptureNavigation
    ? (referenceScriptureQuery.data?.parsedFiles ?? [])
    : [];
  const effectiveReferenceBookCode =
    isReferenceNavSynced && supportsReferenceAnchors
      ? pickedFileIdentifier
      : referenceBookCode;
  const effectiveReferenceChapterNumber =
    isReferenceNavSynced && supportsReferenceAnchors
      ? pickedChapterNumber
      : referenceChapterNumber;
  const activeTranslationNotesItem =
    activeReferenceResource && isTranslationNotesItem(activeReferenceResource)
      ? activeReferenceResource
      : undefined;

  const translationNotesQuery = useTranslationNotesReferenceQuery({
    activeReferenceResource: activeTranslationNotesItem,
    activeReferenceResourcePath,
    supportsTranslationNotes,
    effectiveReferenceBookCode,
    effectiveReferenceChapterNumber,
  });

  usePrefetchAdjacentTranslationNotes({
    queryClient,
    activeReferenceResource: activeTranslationNotesItem,
    activeReferenceResourcePath,
    effectiveReferenceBookCode,
    effectiveReferenceChapterNumber,
    supportsTranslationNotes,
  });

  function switchReferenceBookOrChapter(bookCode: string, chapter: number) {
    if (!supportsScriptureNavigation) return;
    const targetFile = parsedFiles.find((f) => f.bookCode === bookCode);
    if (!targetFile) return;

    const chapterExists = targetFile.chapters.some(
      (chap) => chap.chapterNumber === chapter,
    );
    const fallbackChapter = targetFile.chapters[0]?.chapterNumber;
    const nextChapter = chapterExists ? chapter : fallbackChapter;
    if (nextChapter === undefined) return;

    setReferenceBookCode(bookCode);
    setReferenceChapterNumber(nextChapter);
  }

  function goToReferenceInReference(input: string): boolean {
    if (!supportsScriptureNavigation) return false;
    const parsed = parseReference(input);
    if (!parsed) return false;

    let matchedFile = parsed.knownBookId
      ? parsedFiles.find(
          (f) => f.bookCode.toLowerCase() === parsed.knownBookId?.toLowerCase(),
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
    if (!supportsScriptureNavigation) return undefined;
    return referenceScriptureQuery.data?.parsedFiles.find(
      (f) => f.bookCode === effectiveReferenceBookCode,
    );
  }, [
    effectiveReferenceBookCode,
    referenceScriptureQuery.data,
    supportsScriptureNavigation,
  ]);
  const referenceChapter = useMemo(() => {
    if (!supportsScriptureNavigation) return undefined;
    return referenceFile?.chapters.find(
      (chapter) => chapter.chapterNumber === effectiveReferenceChapterNumber,
    );
  }, [
    effectiveReferenceChapterNumber,
    referenceFile,
    supportsScriptureNavigation,
  ]);

  const nextReferenceLocation = useMemo(() => {
    if (
      !supportsScriptureNavigation ||
      !referenceFile ||
      referenceFile.chapters.length === 0
    ) {
      return null;
    }

    const sortedChapters = referenceFile.chapters.toSorted(
      (a, b) => a.chapterNumber - b.chapterNumber,
    );
    const currentIndex = sortedChapters.findIndex(
      (chapter) => chapter.chapterNumber === effectiveReferenceChapterNumber,
    );
    if (currentIndex >= 0 && currentIndex < sortedChapters.length - 1) {
      return {
        bookCode: referenceFile.bookCode,
        chapterNumber: sortedChapters[currentIndex + 1].chapterNumber,
      };
    }

    const nextBookId = referenceFile.nextBookId;
    if (!nextBookId) return null;
    const nextBook = parsedFiles.find((file) => file.bookCode === nextBookId);
    if (!nextBook || nextBook.chapters.length === 0) return null;

    const firstChapter = Math.min(
      ...nextBook.chapters.map((chapter) => chapter.chapterNumber),
    );
    if (!Number.isFinite(firstChapter)) return null;
    return { bookCode: nextBook.bookCode, chapterNumber: firstChapter };
  }, [
    effectiveReferenceChapterNumber,
    parsedFiles,
    referenceFile,
    supportsScriptureNavigation,
  ]);

  const prevReferenceLocation = useMemo(() => {
    if (
      !supportsScriptureNavigation ||
      !referenceFile ||
      referenceFile.chapters.length === 0
    ) {
      return null;
    }

    const sortedChapters = referenceFile.chapters.toSorted(
      (a, b) => a.chapterNumber - b.chapterNumber,
    );
    const currentIndex = sortedChapters.findIndex(
      (chapter) => chapter.chapterNumber === effectiveReferenceChapterNumber,
    );
    if (currentIndex > 0) {
      return {
        bookCode: referenceFile.bookCode,
        chapterNumber: sortedChapters[currentIndex - 1].chapterNumber,
      };
    }

    const prevBookId = referenceFile.prevBookId;
    if (!prevBookId) return null;
    const prevBook = parsedFiles.find((file) => file.bookCode === prevBookId);
    if (!prevBook || prevBook.chapters.length === 0) return null;

    const lastChapter = Math.max(
      ...prevBook.chapters.map((chapter) => chapter.chapterNumber),
    );
    if (!Number.isFinite(lastChapter)) return null;
    return { bookCode: prevBook.bookCode, chapterNumber: lastChapter };
  }, [
    effectiveReferenceChapterNumber,
    parsedFiles,
    referenceFile,
    supportsScriptureNavigation,
  ]);

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
    if (!supportsReferenceAnchors) {
      setIsReferenceNavSynced(false);
      setIsReferenceScrollSynced(false);
      return;
    }
    setIsReferenceNavSynced(enabled);
    if (!enabled) {
      setIsReferenceScrollSynced(false);
      return;
    }
    setReferenceBookCode(pickedFileIdentifier);
    setReferenceChapterNumber(pickedChapterNumber);
  }

  function setReferenceScrollingSynced(enabled: boolean) {
    if (!isReferenceNavSynced || !supportsScriptureNavigation) return;
    setIsReferenceScrollSynced(enabled);
  }

  function setActiveReferenceResourcePathWithReset(
    resourcePath: string | undefined,
  ) {
    setActiveReferenceResourcePath(resourcePath);
    setIsReferenceNavSynced(true);
    setIsReferenceScrollSynced(false);
    setReferenceBookCode(pickedFileIdentifier);
    setReferenceChapterNumber(pickedChapterNumber);
  }

  async function selectActiveReferenceResourcePath(
    resourcePath: string | undefined,
  ) {
    setActiveReferenceResourcePathWithReset(resourcePath);

    if (!resourcePath) {
      return null;
    }

    const item = await queryClient.fetchQuery({
      queryKey: ["referenceResource", resourcePath],
      queryFn: async () =>
        loadReferenceResourceByPath({
          libraryService,
          resourcePath,
        }),
    });

    if (!isUsfmScriptureItem(item)) {
      return null;
    }

    return await queryClient.fetchQuery({
      queryKey: ["referenceScriptureFiles", resourcePath, referenceShape],
      queryFn: async () =>
        loadReferenceScriptureByPath({
          libraryService,
          resourcePath,
          fileSystem,
          gitProvider,
          shape: referenceShape,
          usfmOnionService: usfmOnionService as IUsfmOnionService,
        }),
    });
  }

  return {
    referenceResourcesQuery,
    activeReferenceResourceQuery,
    referenceScriptureQuery,
    activeReferenceResource,
    activeReferenceResourcePath,
    activeReferenceResourceId: activeReferenceResource?.id,
    activeReferenceResourceDisplayName: activeReferenceResource?.displayName,
    supportsReferenceAnchors,
    supportsScriptureNavigation,
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
    isReferenceNavSynced: supportsReferenceAnchors
      ? isReferenceNavSynced
      : false,
    isReferenceScrollSynced: supportsScriptureNavigation
      ? isReferenceScrollSynced
      : false,
    translationNotesQuery,
    setReferenceNavigationSynced,
    setReferenceScrollingSynced,
    setActiveReferenceResourcePath: setActiveReferenceResourcePathWithReset,
    selectActiveReferenceResourcePath,

    // Backward-compatible aliases for existing scripture-only consumers.
    referenceQuery: referenceScriptureQuery,
    referenceProjectId: activeReferenceResourcePath,
    setReferenceProjectId: setActiveReferenceResourcePathWithReset,
  };
};
