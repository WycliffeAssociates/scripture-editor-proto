import type { LanguageDirection } from "@/core/domain/project/project.ts";
import type {
  CommitRequest,
  VersionEntry,
} from "@/core/persistence/GitProvider.ts";

/**
 * Editable scripture workspace contract.
 *
 * This is the canonical noun for scripture editing operations. `UsfmScriptureItem`
 * composes this contract into the broader typed-item/library architecture.
 */
export const ScriptureWorkspaceType = {
  RESOURCE_CONTAINER: "resource-container",
  SCRIPTURE_BURRITO: "scripture-burrito",
  UNKNOWN: "unknown",
} as const;

export type ScriptureWorkspaceType =
  (typeof ScriptureWorkspaceType)[keyof typeof ScriptureWorkspaceType];

export type ScriptureWorkspaceListItem = {
  folderName: string;
  projectPath: string;
  displayName: string;
  projectId?: string;
  languageCode: string;
  languageName: string;
  projectType?: ScriptureWorkspaceType;
};

export type BookRef = {
  bookCode: string;
  title: string;
  fileName: string;
  storageKey: string;
  path: string;
};

export type BookContents = BookRef & {
  contents: string;
};

export type ScriptureWorkspaceLanguage = {
  code: string;
  name: string;
  direction: LanguageDirection;
};

export interface ScriptureWorkspace {
  readonly folderName: string;
  readonly displayName: string;
  readonly projectPath: string;
  readonly projectId?: string;
  readonly projectType?: ScriptureWorkspaceType;
  readonly language: ScriptureWorkspaceLanguage;
  readonly books: BookRef[];

  listBooks(): Promise<BookRef[]>;
  getBook(storageKey: string): Promise<BookContents>;
  saveBook(storageKey: string, usfmText: string): Promise<void>;
  addBook(
    bookCode: string,
    opts?: {
      localizedBookTitle?: string;
      contents?: string;
    },
  ): Promise<BookRef>;
  /** Remove one known persisted book and its container metadata entry. */
  removeBook(storageKey: string): Promise<void>;
  listVersions(args?: {
    limit?: number;
    offset?: number;
  }): Promise<VersionEntry[]>;
  restoreVersion(versionHash: string): Promise<void>;
  stageAndCommit(
    request: CommitRequest,
    author: { name: string; email: string },
  ): Promise<{ hash: string }>;
}

export type ProjectType = ScriptureWorkspaceType;
export type ProjectListItem = ScriptureWorkspaceListItem;
export type ProjectLanguage = ScriptureWorkspaceLanguage;
export type Project = ScriptureWorkspace;
